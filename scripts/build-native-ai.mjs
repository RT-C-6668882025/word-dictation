import {build} from 'esbuild';
import {transformAsync} from '@babel/core';
import {writeFile} from 'node:fs/promises';
const bundle=await build({entryPoints:['src/nativeAiEngine.ts'],bundle:true,format:'iife',globalName:'WordAiEngine',target:'es2015',platform:'browser',write:false,legalComments:'inline'});
const result=await transformAsync(bundle.outputFiles[0].text,{presets:[['@babel/preset-env',{targets:{ie:'11'},modules:false}]],comments:true});
await writeFile('native/ai-engine.js',result.code);
