// Packages the approved private snapshot. Never write this output to Git/public.
import {readFile,writeFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
const output=process.argv[2];
if(!output?.startsWith('.local/'))throw new Error('Use an output path inside .local/.');
const read=async name=>JSON.parse(await readFile(`.local/${name}.json`,'utf8'));
const snapshot=await read('twin-snapshot');
snapshot.network=await read('atlas-network');
const activity=await read('atlas-activity');
snapshot.activity={capturedAt:activity.capturedAt,source:activity.source,from:activity.from,to:activity.to,rows:activity.rows};
const data={capturedAt:snapshot.capturedAt,source:snapshot.source,houses:snapshot.houses,network:snapshot.network,activity:snapshot.activity};
if(!data.houses.length||!data.network.comparison.length)throw new Error('Snapshot incomplete.');
const encoded=gzipSync(JSON.stringify(data)).toString('base64');
await writeFile(output,encoded,{mode:0o600});
console.log(`Snapshot packaged privately: ${encoded.length} bytes, ${data.houses.length} houses.`);
