import { Page } from '@playwright/test';
import { OrgConfig, Persona, SfSession } from '@kplay/core';
import { loginWithCliFrontdoor } from './cliAuth.js';
import { loginPersonaWithJwt } from './jwtAuth.js';

export class PersonaManager {
  private sessions = new Map<string, SfSession>();

  async getSession(page: Page, org: OrgConfig, personaName: string, authDir = './.auth'): Promise<SfSession> {
    const key = `${org.alias}:${personaName}`;
    if (this.sessions.has(key)) {
      return this.sessions.get(key)!;
    }

    let session: SfSession;
    const persona = org.personas.find(p => p.name === personaName);

    if (persona && org.clientId && org.keyRef) {
      session = await loginPersonaWithJwt(org, persona, authDir);
    } else {
      // Default Fast-Track: CLI frontdoor
      session = await loginWithCliFrontdoor(page, org.alias, authDir);
    }

    this.sessions.set(key, session);
    return session;
  }
}
