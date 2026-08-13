sed -i 's/onRecordsUploaded(records);/setLoadedCount(records.length);\n      onRecordsUploaded(records);/g' src/components/FileUpload.tsx
sed -i 's/Loaded: {fileName} ({currentCount} records)/Loaded: {fileName} ({loadedCount} records)/g' src/components/FileUpload.tsx
