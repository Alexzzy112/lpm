import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const modelPath=path.join(root,'trained-models/random-forest.json');
let model=null;
try { if(existsSync(modelPath)) model=JSON.parse(readFileSync(modelPath,'utf8')); } catch(e) { console.error('Could not read trained model:',e.message); }
export const modelInfo=()=>model?{algorithm:model.algorithm,dataset:model.dataset,records:model.records,trainRecords:model.trainRecords,testRecords:model.testRecords,trainedAt:model.trainedAt,metrics:model.metrics,features:model.features}:null;
export function predict(input) {
  if(!model) throw new Error('The model is not trained. Run npm run setup after internet access is available.');
  const x=model.features.map((key,i)=>{
    const value=input[key];
    if(typeof value==='number') return value;
    // Keep categories as categories so CART splits on membership, not an arbitrary ordinal.
    return model.dictionaries[i]?.includes(value)?value:(model.dictionaries[i]?.[0]??value);
  });
  const walk=(n)=>n.leaf!==undefined?n.leaf:walk((typeof n.threshold==='number'?x[n.feature]<=n.threshold:x[n.feature]===n.threshold)?n.left:n.right);
  const votes=model.labels.map(()=>0); model.trees.forEach(tree=>{const predicted=walk(tree);votes[predicted]+=model.classWeights?.[predicted]??1});
  const winner=votes.indexOf(Math.max(...votes)); return {category:model.labels[winner],probabilities:votes.map(v=>v/model.trees.length),confidence:votes[winner]/model.trees.length};
}
