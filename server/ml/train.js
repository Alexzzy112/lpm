import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Reproducible comparison: the existing 80/20 stratified holdout is kept fixed.
// The tuning split is carved only from the training portion; the test set is not
// used to select hyperparameters.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const dataPath=path.join(root,'dataset/student-por.csv');
const outDir=path.join(root,'trained-models');
const modelPath=path.join(outDir,'random-forest.json');
const labels=['Poor','Average','Good','Excellent'];
const features=['school','sex','age','address','famsize','Pstatus','Medu','Fedu','Mjob','Fjob','reason','guardian','traveltime','studytime','failures','schoolsup','famsup','paid','activities','nursery','higher','internet','romantic','famrel','freetime','goout','Dalc','Walc','health','absences'];
const category=g=>g<=9?0:g<=11?1:g<=15?2:3;
function rngFor(initial){let seed=initial>>>0;return()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296)}
const rng=rngFor(4217);
if(!existsSync(dataPath)){console.error('Dataset missing. Place UCI student-por.csv in dataset/ first.');process.exit(1)}
const lines=readFileSync(dataPath,'utf8').trim().split(/\r?\n/),header=lines.shift().split(';');
const rows=lines.map(line=>{const v=line.split(';'),o=Object.fromEntries(header.map((k,i)=>[k,(v[i]??'').replace(/^"|"$/g,'')]));return{x:features.map(k=>o[k]===''?null:(Number.isFinite(Number(o[k]))&&o[k]!==''?Number(o[k]):o[k])),y:category(Number(o.G3))}}).filter(r=>r.x.length===features.length&&Number.isFinite(r.y));
if(rows.length!==649)console.warn(`Expected 649 source records; parsed ${rows.length}.`);
const classGroups=labels.map((_,c)=>rows.filter(r=>r.y===c).sort(()=>rng()-.5));
const train=[],test=[];
classGroups.forEach(group=>{const cut=Math.max(1,Math.floor(group.length*.8));train.push(...group.slice(0,cut));test.push(...group.slice(cut))});
const countClasses=data=>labels.map((label,i)=>({label,count:data.filter(r=>r.y===i).length}));
const trainCounts=countClasses(train),testCounts=countClasses(test);
const medians=features.map((_,j)=>{const vs=train.map(r=>r.x[j]).filter(v=>typeof v==='number').sort((a,b)=>a-b);return vs.length?vs[Math.floor(vs.length/2)]:0});
const dictionaries=features.map((_,j)=>[...new Set(train.map(r=>r.x[j]).filter(v=>typeof v==='string'))].sort());
const modes=features.map((_,j)=>dictionaries[j].slice().sort((a,b)=>train.filter(r=>r.x[j]===b).length-train.filter(r=>r.x[j]===a).length)[0]??null);
for(const r of [...train,...test])r.x=r.x.map((v,j)=>v===null?(dictionaries[j].length?modes[j]:medians[j]):v);

const gini=(data,weights)=>{if(!data.length)return 0;const counts=labels.map((_,c)=>data.reduce((s,r)=>s+(r.y===c?(weights?.[c]??1):0),0));const sum=counts.reduce((a,b)=>a+b,0);return sum?1-counts.reduce((s,n)=>s+(n/sum)**2,0):0};
function trainTree(data,{maxDepth=9,minLeaf=4,weights=null},rand){
  const leaf=data=>{const scores=labels.map((_,c)=>data.reduce((s,r)=>s+(r.y===c?(weights?.[c]??1):0),0));return{leaf:scores.indexOf(Math.max(...scores))}};
  function build(group,depth){if(depth>=maxDepth||group.length<minLeaf*2||new Set(group.map(r=>r.y)).size<2)return leaf(group);
    const parent=gini(group,weights);let best=null;
    const columns=Array.from({length:features.length},(_,i)=>i).sort(()=>rand()-.5).slice(0,Math.max(2,Math.floor(Math.sqrt(features.length))));
    for(const f of columns){const vals=[...new Set(group.map(r=>r.x[f]).filter(v=>v!==null))].sort((a,b)=>typeof a==='number'?a-b:String(a).localeCompare(String(b)));const numeric=typeof vals[0]==='number';const cuts=numeric?vals.slice(0,-1).map((v,i)=>(v+vals[i+1])/2):vals.slice(0,-1);
      for(const threshold of cuts){const left=[],right=[];for(const r of group){if(numeric?r.x[f]<=threshold:r.x[f]===threshold)left.push(r);else right.push(r)}if(left.length<minLeaf||right.length<minLeaf)continue;const gain=parent-(left.length*gini(left,weights)+right.length*gini(right,weights))/group.length;if(!best||gain>best.gain)best={feature:f,threshold,left,right,gain}}
    }
    if(!best||best.gain<.001)return leaf(group);
    return{feature:best.feature,threshold:best.threshold,left:build(best.left,depth+1),right:build(best.right,depth+1)}
  }
  return build(data,0)
}
const walk=(tree,x)=>tree.leaf!==undefined?tree.leaf:walk((typeof tree.threshold==='number'?x[tree.feature]<=tree.threshold:x[tree.feature]===tree.threshold)?tree.left:tree.right,x);
const predictTrees=(trees,x,weights=null)=>{const votes=labels.map(()=>0);for(const tree of trees)votes[walk(tree,x)]+=weights?.[walk(tree,x)]??1;return votes.indexOf(Math.max(...votes))};
function metricsFor(data,trees,weights=null){const matrix=labels.map(()=>labels.map(()=>0));for(const r of data)matrix[r.y][predictTrees(trees,r.x,weights)]++;const total=data.length,correct=matrix.reduce((s,row,i)=>s+row[i],0);const perClass=labels.map((label,i)=>{const tp=matrix[i][i],fp=matrix.reduce((s,row,j)=>s+(j!==i?row[i]:0),0),fn=matrix[i].reduce((s,v,j)=>s+(j!==i?v:0),0),precision=tp/(tp+fp||1),recall=tp/(tp+fn||1);return{label,precision,recall,f1:2*precision*recall/(precision+recall||1),support:matrix[i].reduce((a,b)=>a+b,0)}});const mean=k=>perClass.reduce((s,x)=>s+x[k],0)/labels.length;return{accuracy:correct/(total||1),precision:mean('precision'),recall:mean('recall'),f1:mean('f1'),confusionMatrix:matrix,perClass}}
function fitForest(data,opts,initialSeed){const rand=rngFor(initialSeed),trees=[];let sampleGroups;
  if(opts.balance==='undersample'||opts.balance==='oversample')sampleGroups=labels.map((_,c)=>data.filter(r=>r.y===c));
  const size=opts.balance==='undersample'?Math.min(...sampleGroups.map(g=>g.length)):opts.balance==='oversample'?Math.max(...sampleGroups.map(g=>g.length)):data.length;
  const weights=opts.balance==='class-weight'?labels.map((_,c)=>data.length/(labels.length*Math.max(1,data.filter(r=>r.y===c).length))):null;
  for(let t=0;t<opts.trees;t++){let sample;
    if(sampleGroups){sample=[];for(const group of sampleGroups)for(let j=0;j<size;j++)sample.push(group[Math.floor(rand()*group.length)])}
    else sample=Array.from({length:data.length},()=>data[Math.floor(rand()*data.length)]);
    trees.push(trainTree(sample,opts,rand));
  }
  return{trees,weights}
}
const baseline=existsSync(modelPath)?JSON.parse(readFileSync(modelPath,'utf8')):null;
const baselineSeed=rngFor(4217); // consume the identical stratification RNG sequence
classGroups.forEach(()=>{});
// Split RNG above is already advanced; recreate baseline RNG advancement from source order.
const baselineRand=rngFor(4217);labels.forEach((_,c)=>rows.filter(r=>r.y===c).sort(()=>baselineRand()-.5));
const baseTrees=[];
for(let t=0;t<41;t++){const sample=Array.from({length:train.length},()=>train[Math.floor(baselineRand()*train.length)]);baseTrees.push(trainTree(sample,{maxDepth:9,minLeaf:4},baselineRand))}
const originalMetrics=metricsFor(test,baseTrees);

// Use a second deterministic stratified split within training for model selection.
const tuneRand=rngFor(99173),tuneGroups=labels.map((_,c)=>train.filter(r=>r.y===c).sort(()=>tuneRand()-.5)),fitRows=[],validation=[];
tuneGroups.forEach(g=>{const cut=Math.max(1,Math.floor(g.length*.8));fitRows.push(...g.slice(0,cut));validation.push(...g.slice(cut))});
const configs=[];
for(const balance of ['undersample','class-weight'])for(const maxDepth of [5,8,11])for(const minLeaf of [3,6])configs.push({balance,maxDepth,minLeaf,trees:61});
const tuning=[];
for(let i=0;i<configs.length;i++){const opts=configs[i],fit=fitForest(fitRows,opts,202600+i*997),m=metricsFor(validation,fit.trees,fit.weights);tuning.push({config:opts,metrics:m});console.log(`Tuning ${i+1}/${configs.length}: ${opts.balance}, depth ${opts.maxDepth}, leaf ${opts.minLeaf}, validation macro-F1 ${(m.f1*100).toFixed(1)}%`)}
tuning.sort((a,b)=>b.metrics.f1-a.metrics.f1||b.metrics.perClass[3].f1-a.metrics.perClass[3].f1||b.metrics.accuracy-a.metrics.accuracy);
const selected=tuning[0],finalFit=fitForest(train,selected.config,786433),improvedMetrics=metricsFor(test,finalFit.trees,finalFit.weights);
const currentBaseline=baseline?.metrics??originalMetrics;
const originalExcellent=currentBaseline.perClass?.[3]?.f1??0, improvedExcellent=improvedMetrics.perClass[3].f1;
// Require gains on both macro-F1 and the underrepresented target class before replacing the app model.
const accept=improvedMetrics.f1>currentBaseline.f1+1e-12&&improvedExcellent>originalExcellent+1e-12;
const comparison={datasetRows:rows.length,split:{seed:4217,method:'Stratified 80/20 holdout; fixed class-wise rows',trainingRows:train.length,testRows:test.length,trainingDistribution:trainCounts,testDistribution:testCounts},imbalance:{largestToSmallestTrainingRatio:Math.max(...trainCounts.map(x=>x.count))/Math.min(...trainCounts.map(x=>x.count)),observation:'The Excellent class has the fewest training records; the majority class has substantially more.'},original:{algorithm:baseline?.algorithm??'Random Forest (41 CART trees)',metrics:currentBaseline,confusionMatrix:currentBaseline.confusionMatrix},tuning:{selectionSplit:'Stratified 80/20 subdivision of training rows only',selectionMetric:'Macro F1, then Excellent F1, then accuracy',trials:tuning.map(t=>({config:t.config,metrics:{accuracy:t.metrics.accuracy,precision:t.metrics.precision,recall:t.metrics.recall,f1:t.metrics.f1,excellent:t.metrics.perClass[3]}})),selected:selected.config},improved:{metrics:improvedMetrics,confusionMatrix:improvedMetrics.confusionMatrix},decision:accept?'Improved model selected: held-out macro-F1 and Excellent-class F1 both exceeded the original.':'Original model retained: the held-out test did not confirm gains in both macro-F1 and Excellent-class F1.'};
mkdirSync(outDir,{recursive:true});writeFileSync(path.join(outDir,'evaluation-comparison.json'),JSON.stringify(comparison,null,2));
if(accept){const artifact={algorithm:`Class-balanced Random Forest (${selected.config.balance}; ${selected.config.trees} CART trees)`,dataset:'UCI Student Performance, Portuguese language',records:rows.length,trainRecords:train.length,testRecords:test.length,seed:4217,features,labels,medians,dictionaries,trees:finalFit.trees,classWeights:finalFit.weights,metrics:improvedMetrics,trainedAt:new Date().toISOString(),gradeBands:'Poor 0–9; Average 10–11; Good 12–15; Excellent 16–20',trainingConfig:selected.config};writeFileSync(modelPath,JSON.stringify(artifact))}
console.log('\nEVALUATION COMPARISON');console.log(JSON.stringify(comparison,null,2));
