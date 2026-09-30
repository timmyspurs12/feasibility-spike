import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = resolve(here, '../../contracts/HealthClaimCampaignEscrow.py');
const destination = resolve(here, '../public/contracts/HealthClaimCampaignEscrow.py');

mkdirSync(dirname(destination), { recursive: true });
copyFileSync(source, destination);
console.log('Synced canonical campaign IC source into public deployment asset.');
