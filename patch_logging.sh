sed -i 's/const ai = getGeminiClient();/console.log("Calling getGeminiClient"); const ai = getGeminiClient();/g' server.ts
sed -i 's/const response = await callGeminiWithRetry/console.log("Calling callGeminiWithRetry with targetModel:", targetModel); const response = await callGeminiWithRetry/g' server.ts
sed -i 's/responseText = response.text/console.log("Got response"); responseText = response.text/g' server.ts
