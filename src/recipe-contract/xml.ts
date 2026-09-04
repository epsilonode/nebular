import { XMLParser, XMLValidator } from 'fast-xml-parser';

import {
  RECIPE_CANONICALIZATION,
  RECIPE_SCHEMA,
  type AdmittedRecipe,
  type RecipeCredentialSlot,
  type RecipeDocument,
  type RecipeEnvironmentEntry,
  type RecipeExecution,
  type RecipeKind,
  type RecipeLifecycle,
  type RecipePort,
  type RecipeProbe,
  type RecipeReceiver,
  type RecipeSource,
  type RecipeStatus,
  type RecipeStopPolicy
} from './model.ts';
import {
  type AuthorityAtom,
  parseAuthorityAtom,
  parseCredentialSlotId,
  parseInjectionName,
  parseProviderEnvironment,
  parseProviderId,
  parseRecipeId,
  type RecipeId
} from './primitives.ts';
import { recipeErr, recipeOk, recipeTry, type RecipeRunnerResult } from './result.ts';

export const RECIPE_XML_MAX_BYTES = 64 * 1024;
export const RECIPE_XML_MAX_DEPTH = 24;
export const RECIPE_XML_MAX_ELEMENTS = 256;
export const RECIPE_XML_MAX_ATTRIBUTES = 1024;
export const RECIPE_XML_MAX_TEXT = 48 * 1024;
export const RECIPE_TIMEOUT_MAX_MS = 24 * 60 * 60 * 1000;

type UnknownRecord = Readonly<Record<string, unknown>>;
type XmlMetrics = Readonly<{ elements: number; attributes: number; text: number; depth: number }>;
type XmlElement = Readonly<{
  tag: string;
  attributes: Readonly<Record<string, string>>;
  children: readonly unknown[];
}>;

const xmlParser = new XMLParser({
  allowBooleanAttributes: false,
  attributeNamePrefix: '',
  ignoreAttributes: false,
  parseTagValue: false,
  preserveOrder: true,
  processEntities: true,
  textNodeName: '#text',
  trimValues: true
});

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const traverse = <Input, Output>(
  values: readonly Input[],
  project: (value: Input, index: number) => RecipeRunnerResult<Output>
): RecipeRunnerResult<readonly Output[]> =>
  values.reduce<RecipeRunnerResult<readonly Output[]>>(
    (accumulated, value, index) => accumulated.andThen(outputs =>
      project(value, index).map(output => [...outputs, output] as const)
    ),
    recipeOk([])
  );

const addMetrics = (left: XmlMetrics, right: XmlMetrics): XmlMetrics => ({
  elements: left.elements + right.elements,
  attributes: left.attributes + right.attributes,
  text: left.text + right.text,
  depth: Math.max(left.depth, right.depth)
});

const emptyMetrics = (depth: number): XmlMetrics => ({ elements: 0, attributes: 0, text: 0, depth });

const measureXml = (value: unknown, depth = 0): RecipeRunnerResult<XmlMetrics> => {
  if (depth > RECIPE_XML_MAX_DEPTH) {
    return recipeErr({ code: 'resource-limit', message: 'Recipe XML exceeds its depth budget.' });
  }
  if (typeof value === 'string') return recipeOk({ ...emptyMetrics(depth), text: value.length });
  if (Array.isArray(value)) {
    return traverse(value, entry => measureXml(entry, depth + 1)).map(metrics =>
      metrics.reduce(addMetrics, emptyMetrics(depth))
    );
  }
  if (!isRecord(value)) return recipeOk(emptyMetrics(depth));
  const attributes = isRecord(value[':@']) ? Object.keys(value[':@']).length : 0;
  const elementKeys: readonly string[] = Object.keys(value).filter(key => key !== ':@' && key !== '#text' && !key.startsWith('?'));
  return traverse(Object.values(value), entry => measureXml(entry, depth + 1)).map(metrics => ({
    ...metrics.reduce(addMetrics, emptyMetrics(depth)),
    elements: metrics.reduce(addMetrics, emptyMetrics(depth)).elements + elementKeys.length,
    attributes: metrics.reduce(addMetrics, emptyMetrics(depth)).attributes + attributes
  }));
};

const withinXmlBudgets = (metrics: XmlMetrics): RecipeRunnerResult<XmlMetrics> =>
  metrics.elements <= RECIPE_XML_MAX_ELEMENTS &&
  metrics.attributes <= RECIPE_XML_MAX_ATTRIBUTES &&
  metrics.text <= RECIPE_XML_MAX_TEXT
    ? recipeOk(metrics)
    : recipeErr({ code: 'resource-limit', message: 'Recipe XML exceeds its structural budget.' });

const decodeAttributes = (
  input: unknown,
  path: readonly (string | number)[]
): RecipeRunnerResult<Readonly<Record<string, string>>> => {
  if (input === undefined) return recipeOk({});
  if (!isRecord(input)) {
    return recipeErr({ code: 'invalid-xml', message: 'Element attributes are malformed.', path });
  }
  const entries: ReadonlyArray<readonly [string, unknown]> = Object.entries(input);
  const invalid = entries.find((entry: readonly [string, unknown]) => typeof entry[1] !== 'string');
  const stringEntries: ReadonlyArray<readonly [string, string]> = entries.reduce<ReadonlyArray<readonly [string, string]>>(
    (decoded, [key, value]) => typeof value === 'string' ? [...decoded, [key, value] as const] as const : decoded,
    []
  );
  return invalid === undefined
    ? recipeOk(Object.fromEntries(stringEntries))
    : recipeErr({ code: 'invalid-xml', message: 'Element attributes must be textual.', path });
};

const decodeElement = (
  input: unknown,
  path: readonly (string | number)[]
): RecipeRunnerResult<XmlElement | undefined> => {
  if (!isRecord(input)) {
    return recipeErr({ code: 'invalid-xml', message: 'Recipe XML contains a malformed node.', path });
  }
  const text = input['#text'];
  const recordEntries: ReadonlyArray<readonly [string, unknown]> = Object.entries(input);
  const elementEntries: ReadonlyArray<readonly [string, unknown]> = recordEntries
    .filter(([key]: readonly [string, unknown]) => key !== ':@' && key !== '#text');
  if (elementEntries.length === 0) {
    return typeof text === 'string' && text.trim().length === 0
      ? recipeOk(undefined)
      : recipeErr({ code: 'invalid-xml', message: 'Mixed text is not allowed at this location.', path });
  }
  if (elementEntries.length !== 1) {
    return recipeErr({ code: 'invalid-xml', message: 'Recipe XML node has ambiguous element content.', path });
  }
  const entry = elementEntries[0];
  if (entry === undefined) return recipeErr({ code: 'invalid-xml', message: 'Recipe XML element is missing.', path });
  const [tag, childValue] = entry;
  if (tag.startsWith('?')) return recipeOk(undefined);
  if (!Array.isArray(childValue)) {
    return recipeErr({ code: 'invalid-xml', message: 'Recipe XML element children are malformed.', path: [...path, tag] });
  }
  return decodeAttributes(input[':@'], [...path, tag]).map(attributes => ({
    tag,
    attributes,
    children: childValue
  }));
};

const decodeElements = (
  nodes: readonly unknown[],
  path: readonly (string | number)[]
): RecipeRunnerResult<readonly XmlElement[]> =>
  traverse(nodes, (node, index): RecipeRunnerResult<XmlElement | undefined> => decodeElement(node, [...path, index])).map((elements): readonly XmlElement[] =>
    elements.filter((element): element is XmlElement => element !== undefined)
  );

const ensureKnownAttributes = (
  element: XmlElement,
  allowed: readonly string[],
  path: readonly (string | number)[]
): RecipeRunnerResult<XmlElement> => {
  const unknown = Object.keys(element.attributes).find(attribute => !allowed.includes(attribute));
  return unknown === undefined
    ? recipeOk(element)
    : recipeErr({ code: 'unknown-field', message: `Unknown ${element.tag} attribute.`, path: [...path, unknown] });
};

const ensureKnownChildren = (
  elements: readonly XmlElement[],
  allowed: readonly string[],
  path: readonly (string | number)[]
): RecipeRunnerResult<readonly XmlElement[]> => {
  const unknown = elements.find(element => !allowed.includes(element.tag));
  return unknown === undefined
    ? recipeOk(elements)
    : recipeErr({ code: 'unknown-field', message: `Unknown recipe element <${unknown.tag}>.`, path: [...path, unknown.tag] });
};

const singleChild = (
  elements: readonly XmlElement[],
  tag: string,
  path: readonly (string | number)[]
): RecipeRunnerResult<XmlElement | undefined> => {
  const matches: readonly XmlElement[] = elements.filter(element => element.tag === tag);
  return matches.length <= 1
    ? recipeOk(matches[0])
    : recipeErr({ code: 'invalid-recipe', message: `<${tag}> may appear at most once.`, path: [...path, tag] });
};

const textContent = (element: XmlElement, path: readonly (string | number)[]): RecipeRunnerResult<string> =>
  traverse(element.children, (node, index): RecipeRunnerResult<string> => {
    if (!isRecord(node) || typeof node['#text'] !== 'string' || Object.keys(node).some(key => key !== '#text')) {
      return recipeErr({ code: 'invalid-xml', message: `<${element.tag}> must contain text only.`, path: [...path, index] });
    }
    return recipeOk(node['#text']);
  }).map(parts => parts.join('').trim());

const ensureEmptyElement = (element: XmlElement, path: readonly (string | number)[]): RecipeRunnerResult<XmlElement> =>
  decodeElements(element.children, path).andThen(children =>
    children.length === 0
      ? recipeOk(element)
      : recipeErr({ code: 'unknown-field', message: `<${element.tag}> cannot contain child elements.`, path })
  );

const decodeDiagnosticText = (element: XmlElement, path: readonly (string | number)[]): RecipeRunnerResult<string> =>
  ensureKnownAttributes(element, [], path).andThen(() => textContent(element, path));

const requiredAttribute = (
  element: XmlElement,
  name: string,
  path: readonly (string | number)[]
): RecipeRunnerResult<string> => {
  const value = element.attributes[name];
  return value !== undefined && value.length > 0 && !value.includes('\0')
    ? recipeOk(value)
    : recipeErr({ code: 'invalid-recipe', message: `<${element.tag}> requires ${name}.`, path: [...path, name] });
};

const optionalAttribute = (element: XmlElement, name: string): string | undefined => element.attributes[name];

const parseKind = (value: string | undefined): RecipeRunnerResult<RecipeKind> => {
  switch (value ?? 'entrypoint') {
    case 'entrypoint': return recipeOk('entrypoint');
    case 'base': return recipeOk('base');
    default: return recipeErr({ code: 'invalid-recipe', message: 'Recipe kind is invalid.', path: ['recipe', 'kind'] });
  }
};

const parseStatus = (value: string | undefined): RecipeRunnerResult<RecipeStatus> => {
  switch (value ?? 'active') {
    case 'active': return recipeOk('active');
    case 'deprecated': return recipeOk('deprecated');
    case 'legacy': return recipeOk('legacy');
    case 'retired': return recipeOk('retired');
    default: return recipeErr({ code: 'invalid-recipe', message: 'Recipe status is invalid.', path: ['recipe', 'status'] });
  }
};

const parseReceiver = (value: string | undefined): RecipeRunnerResult<RecipeReceiver> => {
  switch (value ?? 'pm2') {
    case 'pm2': return recipeOk('pm2');
    case 'observe-only': return recipeOk('observe-only');
    case 'direct': return recipeErr({ code: 'unsafe-recipe', message: 'Direct recipe execution is not admitted.', path: ['recipe', 'receiver'] });
    default: return recipeErr({ code: 'invalid-recipe', message: 'Recipe receiver is invalid.', path: ['recipe', 'receiver'] });
  }
};

const parseLifecycle = (value: string | undefined): RecipeRunnerResult<RecipeLifecycle> => {
  switch (value ?? 'one-shot') {
    case 'one-shot': return recipeOk('one-shot');
    case 'long-lived': return recipeOk('long-lived');
    case 'service': return recipeOk('service');
    default: return recipeErr({ code: 'invalid-recipe', message: 'Recipe lifecycle is invalid.', path: ['recipe', 'lifecycle'] });
  }
};

const parseStopPolicy = (value: string): RecipeRunnerResult<RecipeStopPolicy> => {
  switch (value) {
    case 'ephemeral-safe-to-stop': return recipeOk(value);
    case 'service-safe-to-stop': return recipeOk(value);
    case 'manual-stop-only': return recipeOk(value);
    case 'observe-only': return recipeOk(value);
    default: return recipeErr({ code: 'invalid-recipe', message: 'Recipe stop policy is invalid.', path: ['recipe', 'stop-policy'] });
  }
};

const parsePositiveInteger = (
  value: string | undefined,
  message: string,
  path: readonly (string | number)[]
): RecipeRunnerResult<number> => {
  const parsed = value === undefined ? Number.NaN : Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0
    ? recipeOk(parsed)
    : recipeErr({ code: 'invalid-recipe', message, path });
};

const validLiteral = (value: string, maxLength: number): boolean =>
  value.length > 0 && value.length <= maxLength && !value.includes('\0') && !value.includes('${');

const duplicateCaseFolded = (values: readonly string[]): string | undefined =>
  values.find((value, index) => values.findIndex(candidate => candidate.toLocaleUpperCase('en-US') === value.toLocaleUpperCase('en-US')) !== index);

const decodeEnvironment = (element: XmlElement, index: number): RecipeRunnerResult<RecipeEnvironmentEntry> =>
  ensureKnownAttributes(element, ['name', 'value'], ['recipe', 'exec', 'env', index]).andThen(known =>
    ensureEmptyElement(known, ['recipe', 'exec', 'env', index]).andThen(() =>
      requiredAttribute(known, 'name', ['recipe', 'exec', 'env', index]).andThen(name =>
      parseInjectionName(name).andThen(parsedName => {
        const value = optionalAttribute(known, 'value') ?? '';
        return !value.includes('\0') && !value.includes('${')
          ? recipeOk({ name: parsedName, value })
          : recipeErr({ code: 'invalid-recipe', message: 'Environment value is unresolved or invalid.', path: ['recipe', 'exec', 'env', index, 'value'] });
      })
      )
    )
  );

const decodeSource = (element: XmlElement): RecipeRunnerResult<RecipeSource> =>
  ensureKnownAttributes(element, ['manifest', 'command', 'task', 'tool', 'doc'], ['recipe', 'source']).andThen(known =>
    ensureEmptyElement(known, ['recipe', 'source']).andThen(() => {
      const manifest = optionalAttribute(known, 'manifest');
      const command = optionalAttribute(known, 'command');
      const task = optionalAttribute(known, 'task');
      const tool = optionalAttribute(known, 'tool');
      const doc = optionalAttribute(known, 'doc');
      const source: RecipeSource = {
        ...(manifest === undefined ? {} : { manifest }),
        ...(command === undefined ? {} : { command }),
        ...(task === undefined ? {} : { task }),
        ...(tool === undefined ? {} : { tool }),
        ...(doc === undefined ? {} : { doc })
      };
      return Object.values(source).length > 0 && Object.values(source).every(value => validLiteral(value, 4096))
        ? recipeOk(source)
        : recipeErr({ code: 'invalid-recipe', message: 'Recipe source provenance is invalid.', path: ['recipe', 'source'] });
    })
  );

const decodeExecution = (element: XmlElement): RecipeRunnerResult<RecipeExecution> =>
  ensureKnownAttributes(element, ['name', 'cwd', 'tool'], ['recipe', 'exec']).andThen(known =>
    decodeElements(known.children, ['recipe', 'exec']).andThen(children =>
      ensureKnownChildren(children, ['arg', 'env'], ['recipe', 'exec']).andThen(() =>
        requiredAttribute(known, 'name', ['recipe', 'exec']).andThen(processName =>
          requiredAttribute(known, 'cwd', ['recipe', 'exec']).andThen(cwd =>
            requiredAttribute(known, 'tool', ['recipe', 'exec']).andThen(tool =>
              traverse(children.filter(child => child.tag === 'arg'), (argument, index) =>
                ensureKnownAttributes(argument, [], ['recipe', 'exec', 'arg', index]).andThen(() =>
                  textContent(argument, ['recipe', 'exec', 'arg', index]).andThen(value =>
                    validLiteral(value, 4096)
                      ? recipeOk(value)
                      : recipeErr({ code: 'invalid-recipe', message: 'Recipe argument is unresolved or invalid.', path: ['recipe', 'exec', 'arg', index] })
                  )
                )
              ).andThen(argv =>
                traverse(children.filter(child => child.tag === 'env'), decodeEnvironment).andThen(environment => {
                  const duplicate = duplicateCaseFolded(environment.map(entry => entry.name.value));
                  return validLiteral(processName, 128) && validLiteral(cwd, 4096) && validLiteral(tool, 4096) && duplicate === undefined
                    ? recipeOk({ processName, cwd, tool, argv, environment })
                    : recipeErr({
                        code: duplicate === undefined ? 'invalid-recipe' : 'unsafe-recipe',
                        message: duplicate === undefined ? 'Recipe execution fields are unresolved or invalid.' : 'Environment names collide under Windows case folding.',
                        path: ['recipe', 'exec']
                      });
                })
              )
            )
          )
        )
      )
    )
  );

const decodePort = (element: XmlElement, index: number): RecipeRunnerResult<RecipePort> =>
  ensureKnownAttributes(element, ['name', 'value', 'range-start', 'range-end', 'host', 'host-alias'], ['recipe', 'port', index]).andThen(known =>
    ensureEmptyElement(known, ['recipe', 'port', index]).andThen(() =>
      requiredAttribute(known, 'name', ['recipe', 'port', index]).andThen(name => {
      const value = optionalAttribute(known, 'value');
      const rangeStart = optionalAttribute(known, 'range-start');
      const rangeEnd = optionalAttribute(known, 'range-end');
      const host = optionalAttribute(known, 'host');
      const hostAlias = optionalAttribute(known, 'host-alias');
      const fixed = value !== undefined;
      const ranged = rangeStart !== undefined || rangeEnd !== undefined;
      const values: readonly string[] = [value, rangeStart, rangeEnd, host, hostAlias]
        .filter((candidate): candidate is string => candidate !== undefined);
      return validLiteral(name, 128) &&
        values.every(candidate => validLiteral(candidate, 4096)) &&
        fixed !== ranged &&
        (!ranged || (rangeStart !== undefined && rangeEnd !== undefined))
        ? recipeOk({
            name,
            ...(value === undefined ? {} : { value }),
            ...(rangeStart === undefined ? {} : { rangeStart }),
            ...(rangeEnd === undefined ? {} : { rangeEnd }),
            ...(host === undefined ? {} : { host }),
            ...(hostAlias === undefined ? {} : { hostAlias })
          })
        : recipeErr({ code: 'invalid-recipe', message: 'Recipe port must declare one fixed value or one complete range.', path: ['recipe', 'port', index] });
      })
    )
  );

const decodeProbe = (element: XmlElement, index: number): RecipeRunnerResult<RecipeProbe> =>
  ensureKnownAttributes(element, ['url', 'status'], ['recipe', 'probe', index]).andThen(known =>
    ensureEmptyElement(known, ['recipe', 'probe', index]).andThen(() =>
      requiredAttribute(known, 'url', ['recipe', 'probe', index]).andThen(url => {
      const rawStatus = optionalAttribute(known, 'status');
      if (!validLiteral(url, 4096)) return recipeErr({ code: 'invalid-recipe', message: 'Recipe probe URL is invalid.', path: ['recipe', 'probe', index, 'url'] });
      if (rawStatus === undefined) return recipeOk({ url });
      return parsePositiveInteger(rawStatus, 'Recipe probe status is invalid.', ['recipe', 'probe', index, 'status']).andThen(status =>
        status >= 100 && status <= 599
          ? recipeOk({ url, status })
          : recipeErr({ code: 'invalid-recipe', message: 'Recipe probe status is invalid.', path: ['recipe', 'probe', index, 'status'] })
      );
      })
    )
  );

const decodeAuthorityValues = (
  element: XmlElement,
  tag: 'operation' | 'scope',
  path: readonly (string | number)[]
): RecipeRunnerResult<readonly AuthorityAtom[]> =>
  traverse(element.children, (node, index) => decodeElement(node, [...path, index])).andThen(decoded => {
    const children: readonly XmlElement[] = decoded.filter((child): child is XmlElement => child !== undefined);
    return ensureKnownChildren(children, ['operation', 'scope'], path).andThen(() =>
      traverse(children.filter(child => child.tag === tag), (child, index) =>
        ensureKnownAttributes(child, [], [...path, tag, index]).andThen(() =>
          textContent(child, [...path, tag, index]).andThen(parseAuthorityAtom)
        )
      ).map((values): readonly AuthorityAtom[] => values.filter((value, index) => values.findIndex(candidate => candidate.value === value.value) === index)
        .toSorted((left, right) => left.value.localeCompare(right.value)))
    );
  });

const decodeCredentialSlot = (element: XmlElement, index: number): RecipeRunnerResult<RecipeCredentialSlot> => {
  const path = ['recipe', 'credential-slot', index] as const;
  return ensureKnownAttributes(element, ['id', 'provider', 'account', 'environment', 'delivery', 'inject'], path).andThen(known =>
    requiredAttribute(known, 'id', path).andThen(id =>
      parseCredentialSlotId(id).andThen(parsedId =>
        requiredAttribute(known, 'provider', path).andThen(provider =>
          parseProviderId(provider).andThen(parsedProvider =>
            requiredAttribute(known, 'environment', path).andThen(environment =>
              parseProviderEnvironment(environment).andThen(parsedEnvironment =>
                requiredAttribute(known, 'delivery', path).andThen(delivery =>
                  requiredAttribute(known, 'inject', path).andThen(inject =>
                    parseInjectionName(inject).andThen(parsedInject =>
                      decodeAuthorityValues(known, 'operation', path).andThen(operations =>
                        decodeAuthorityValues(known, 'scope', path).andThen(scopes => {
                          const account = optionalAttribute(known, 'account');
                          return delivery === 'environment' && operations.length + scopes.length > 0 && (account === undefined || validLiteral(account, 256))
                            ? recipeOk<RecipeCredentialSlot>({
                                id: parsedId,
                                provider: parsedProvider,
                                ...(account === undefined ? {} : { account }),
                                environment: parsedEnvironment,
                                delivery: 'environment',
                                inject: parsedInject,
                                operations,
                                scopes
                              })
                            : recipeErr({ code: 'invalid-recipe', message: 'Credential slot delivery, account, or authority set is invalid.', path });
                        })
                      )
                    )
                  )
                )
              )
            )
          )
        )
      )
    )
  );
};

const decodeStopPolicy = (element: XmlElement): RecipeRunnerResult<RecipeStopPolicy> =>
  ensureKnownAttributes(element, ['value'], ['recipe', 'stop-policy']).andThen(known =>
    ensureEmptyElement(known, ['recipe', 'stop-policy']).andThen(() =>
      requiredAttribute(known, 'value', ['recipe', 'stop-policy']).andThen(parseStopPolicy)
    )
  );

const decodeTimeout = (element: XmlElement): RecipeRunnerResult<number> =>
  ensureKnownAttributes(element, ['ms'], ['recipe', 'timeout']).andThen(known =>
    ensureEmptyElement(known, ['recipe', 'timeout']).andThen(() =>
      parsePositiveInteger(optionalAttribute(known, 'ms'), 'Recipe timeout must be a positive integer.', ['recipe', 'timeout', 'ms']).andThen(timeoutMs =>
        timeoutMs <= RECIPE_TIMEOUT_MAX_MS
          ? recipeOk(timeoutMs)
          : recipeErr({ code: 'resource-limit', message: 'Recipe timeout exceeds its admitted bound.', path: ['recipe', 'timeout', 'ms'] })
      )
    )
  );

const parseDocumentRoot = (ast: unknown): RecipeRunnerResult<XmlElement> =>
  Array.isArray(ast)
    ? decodeElements(ast, []).andThen(elements => {
        const roots: readonly XmlElement[] = elements.filter(element => element.tag === 'recipe');
        const unknown = elements.find(element => element.tag !== 'recipe');
        if (unknown !== undefined) return recipeErr({ code: 'unknown-field', message: `Unknown document root <${unknown.tag}>.` });
        return roots.length === 1 && roots[0] !== undefined
          ? recipeOk(roots[0])
          : recipeErr({ code: 'invalid-xml', message: 'Recipe XML must contain exactly one <recipe> root.' });
      })
    : recipeErr({ code: 'invalid-xml', message: 'Recipe XML document is malformed.' });

const parseXmlAst = (xml: unknown): RecipeRunnerResult<unknown> => {
  if (typeof xml !== 'string') return recipeErr({ code: 'invalid-input', message: 'Recipe XML must be text.' });
  if (new TextEncoder().encode(xml).byteLength > RECIPE_XML_MAX_BYTES) {
    return recipeErr({ code: 'resource-limit', message: 'Recipe XML exceeds its byte budget.' });
  }
  if (xml.includes('\0') || /<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml)) {
    return recipeErr({ code: 'unsafe-recipe', message: 'Recipe XML declarations and entities are forbidden.' });
  }
  const validation: unknown = XMLValidator.validate(xml, { allowBooleanAttributes: false });
  if (validation !== true) return recipeErr({ code: 'invalid-xml', message: 'Recipe XML is not well formed.' });
  return recipeTry<unknown>(
    () => xmlParser.parse(xml),
    { code: 'invalid-xml', message: 'Recipe XML could not be decoded.' }
  ).andThen(ast => measureXml(ast).andThen(withinXmlBudgets).map(() => ast));
};

export const decodeRecipeXml = (xml: unknown): RecipeRunnerResult<RecipeDocument> =>
  parseXmlAst(xml).andThen(parseDocumentRoot).andThen(root =>
    ensureKnownAttributes(root, ['schema', 'id', 'kind', 'status', 'extends', 'receiver', 'lifecycle'], ['recipe']).andThen(knownRoot => {
      if (optionalAttribute(knownRoot, 'schema') !== RECIPE_SCHEMA) {
        return recipeErr({ code: 'unsupported-schema', message: 'Recipe schema is not supported.', path: ['recipe', 'schema'] });
      }
      return decodeElements(knownRoot.children, ['recipe']).andThen(children =>
        ensureKnownChildren(children, ['summary', 'purpose', 'source', 'exec', 'stop-policy', 'timeout', 'port', 'probe', 'credential-slot'], ['recipe']).andThen(() =>
          singleChild(children, 'exec', ['recipe']).andThen(execElement =>
            singleChild(children, 'stop-policy', ['recipe']).andThen(stopElement =>
              singleChild(children, 'timeout', ['recipe']).andThen(timeoutElement =>
                singleChild(children, 'source', ['recipe']).andThen(sourceElement =>
                  singleChild(children, 'summary', ['recipe']).andThen(summaryElement =>
                    singleChild(children, 'purpose', ['recipe']).andThen(purposeElement =>
                requiredAttribute(knownRoot, 'id', ['recipe']).andThen(parseRecipeId).andThen(id =>
                  parseKind(optionalAttribute(knownRoot, 'kind')).andThen(kind =>
                    parseStatus(optionalAttribute(knownRoot, 'status')).andThen(status =>
                      parseReceiver(optionalAttribute(knownRoot, 'receiver')).andThen(receiver =>
                        parseLifecycle(optionalAttribute(knownRoot, 'lifecycle')).andThen(lifecycle => {
                          const extendsValue = optionalAttribute(knownRoot, 'extends');
                          const extendsResult: RecipeRunnerResult<RecipeId | undefined> = extendsValue === undefined
                            ? recipeOk(undefined)
                            : parseRecipeId(extendsValue);
                          const executionResult: RecipeRunnerResult<RecipeExecution | undefined> = execElement === undefined
                            ? recipeOk(undefined)
                            : decodeExecution(execElement);
                          const stopResult: RecipeRunnerResult<RecipeStopPolicy | undefined> = stopElement === undefined
                            ? recipeOk(undefined)
                            : decodeStopPolicy(stopElement);
                          const timeoutResult: RecipeRunnerResult<number | undefined> = timeoutElement === undefined
                            ? recipeOk(undefined)
                            : decodeTimeout(timeoutElement);
                          const sourceResult: RecipeRunnerResult<RecipeSource | undefined> = sourceElement === undefined
                            ? recipeOk(undefined)
                            : decodeSource(sourceElement);
                          const summaryResult = summaryElement === undefined ? recipeOk('') : decodeDiagnosticText(summaryElement, ['recipe', 'summary']);
                          const purposeResult = purposeElement === undefined ? recipeOk('') : decodeDiagnosticText(purposeElement, ['recipe', 'purpose']);
                          return extendsResult.andThen(extendsRecipeId =>
                            executionResult.andThen(execution =>
                              stopResult.andThen(stopPolicy =>
                                timeoutResult.andThen(timeoutMs =>
                                  sourceResult.andThen(source =>
                                    summaryResult.andThen(() =>
                                      purposeResult.andThen(() =>
                                  traverse(children.filter(child => child.tag === 'port'), decodePort).andThen(ports =>
                                    traverse(children.filter(child => child.tag === 'probe'), decodeProbe).andThen(probes =>
                                      traverse(children.filter(child => child.tag === 'credential-slot'), decodeCredentialSlot).map(credentialSlots => ({
                                        schema: RECIPE_SCHEMA,
                                        id,
                                        kind,
                                        status,
                                        receiver,
                                        lifecycle,
                                        ...(extendsRecipeId === undefined ? {} : { extendsRecipeId }),
                                        ...(stopPolicy === undefined ? {} : { stopPolicy }),
                                        ...(timeoutMs === undefined ? {} : { timeoutMs }),
                                        ...(source === undefined ? {} : { source }),
                                        ...(execution === undefined ? {} : { execution }),
                                        ports,
                                        probes,
                                        credentialSlots
                                      }))
                                    )
                                  )
                                      )
                                    )
                                  )
                                )
                              )
                            )
                          );
                        })
                      )
                    )
                  )
                )
                    )
                  )
                )
              )
            )
          )
        )
      );
    })
  );

const defaultStopPolicy = (document: RecipeDocument): RecipeStopPolicy => {
  if (document.receiver === 'observe-only') return 'observe-only';
  if (document.lifecycle === 'one-shot') return 'ephemeral-safe-to-stop';
  return 'manual-stop-only';
};

const validateAdmission = (document: RecipeDocument): RecipeRunnerResult<RecipeDocument> => {
  if (document.extendsRecipeId !== undefined) {
    return recipeErr({ code: 'inheritance-unresolved', message: 'Recipe inheritance must be resolved by the admitted kernel before execution.' });
  }
  if (document.kind !== 'entrypoint' || document.status !== 'active') {
    return recipeErr({ code: 'invalid-recipe', message: 'Only active entrypoint recipes may execute.' });
  }
  if (document.timeoutMs === undefined) {
    return recipeErr({ code: 'unsafe-recipe', message: 'Every executable or observed recipe requires an explicit bounded timeout.' });
  }
  if ((document.receiver === 'pm2') !== (document.execution !== undefined)) {
    return recipeErr({ code: 'invalid-recipe', message: 'PM2 recipes require exec; observe-only recipes forbid exec.' });
  }
  if (document.receiver === 'observe-only' && document.credentialSlots.length > 0) {
    return recipeErr({ code: 'unsafe-recipe', message: 'Observe-only recipes cannot request credentials.' });
  }
  const slotIdCollision = duplicateCaseFolded(document.credentialSlots.map(slot => slot.id.value));
  const injectionCollision = duplicateCaseFolded([
    ...(document.execution?.environment.map(entry => entry.name.value) ?? []),
    ...document.credentialSlots.map(slot => slot.inject.value)
  ]);
  if (slotIdCollision !== undefined || injectionCollision !== undefined) {
    return recipeErr({ code: 'unsafe-recipe', message: 'Credential or environment names collide under Windows case folding.' });
  }
  const effectiveStopPolicy = document.stopPolicy ?? defaultStopPolicy(document);
  const receiverPolicyMismatch = (document.receiver === 'observe-only' && effectiveStopPolicy !== 'observe-only') ||
    (document.receiver === 'pm2' && effectiveStopPolicy === 'observe-only');
  const unsafeSecretLifetime = document.credentialSlots.length > 0 && (
    effectiveStopPolicy === 'manual-stop-only' ||
    effectiveStopPolicy === 'observe-only' ||
    (document.lifecycle !== 'one-shot' && effectiveStopPolicy !== 'service-safe-to-stop')
  );
  return receiverPolicyMismatch || unsafeSecretLifetime
    ? recipeErr({ code: 'unsafe-recipe', message: 'Long-lived secret-bearing recipes require an enforceable safe-stop policy.' })
    : recipeOk(document);
};

export const admitRecipe = (document: RecipeDocument): RecipeRunnerResult<AdmittedRecipe> =>
  validateAdmission(document).map(valid => ({
    state: 'admitted',
    semantic: {
      schema: RECIPE_SCHEMA,
      canonicalization: RECIPE_CANONICALIZATION,
      id: valid.id,
      receiver: valid.receiver,
      lifecycle: valid.lifecycle,
      stopPolicy: valid.stopPolicy ?? defaultStopPolicy(valid),
      timeoutMs: valid.timeoutMs ?? 0,
      ...(valid.source === undefined ? {} : { source: valid.source }),
      ...(valid.execution === undefined ? {} : { execution: valid.execution }),
      ports: valid.ports.toSorted((left, right) => left.name.localeCompare(right.name)),
      probes: valid.probes,
      credentialSlots: valid.credentialSlots.toSorted((left, right) => left.id.value.localeCompare(right.id.value))
    }
  }));

export const decodeAndAdmitRecipeXml = (xml: unknown): RecipeRunnerResult<AdmittedRecipe> =>
  decodeRecipeXml(xml).andThen(admitRecipe);
