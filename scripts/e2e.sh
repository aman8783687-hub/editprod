#!/bin/bash
set -e
export OPENCODE_MOCK=1 PORT=3101 DATA_FILE=/tmp/e2e-db.json
rm -f /tmp/e2e-db.json
node server/src/index.js & SRV=$!
sleep 2
curl -sf localhost:3101/api/health
CID=$(curl -sf -X POST localhost:3101/api/conversations -H 'Content-Type: application/json' -d '{"title":"e2e"}' | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).id))")
echo "CID=$CID"
curl -sf -X POST localhost:3101/api/conversations/$CID/messages -H 'Content-Type: application/json' -d '{"text":"hello"}' | grep -q started
sleep 3
curl -sf localhost:3101/api/conversations/$CID | grep -q hello
kill $SRV
echo E2E_OK
