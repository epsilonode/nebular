import * as teleport from '@epsilonode/nebular';
import * as brokerClient from '@epsilonode/nebular/broker-client';
import * as recipeRunner from '@epsilonode/nebular/recipe-runner';
import * as broker from '@epsilonode/nebular/broker';

export const packageSurfaceProof = Object.freeze({
  teleportRegistry: teleport.createTeleportCodecRegistry,
  brokerControlDecoder: brokerClient.decodeBrokerControlMessage,
  recipeDecoder: recipeRunner.decodeAndAdmitRecipeXml,
  brokerAuthority: broker.resolveAndAuthorizeExecution
});
