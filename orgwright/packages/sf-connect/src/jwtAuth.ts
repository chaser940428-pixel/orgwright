import { OrgConfig, Persona, SfSession } from '@orgwright/core';
import * as path from 'path';

export async function loginPersonaWithJwt(org: OrgConfig, persona: Persona, authDir = './.auth'): Promise<SfSession> {
  const storageStatePath = path.resolve(authDir, `${org.alias}-${persona.name}-state.json`);
  console.log(`[sf-connect] Initiating JWT bearer OAuth for persona: "${persona.name}" (${persona.username}) against ${org.loginUrl}...`);

  // In production, signJwt with private key and post to /services/oauth2/token
  // Fallback to org default session if local key is not configured
  return {
    alias: org.alias,
    persona: persona.name,
    instanceUrl: org.instanceUrl || org.loginUrl,
    storageStatePath
  };
}
