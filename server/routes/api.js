import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import User from '../models/User.js';
import Prediction from '../models/Prediction.js';
import { authenticate,adminOnly } from '../middleware/auth.js';
import { predict,modelInfo } from '../services/model.js';

const router=Router();
const authLimit=rateLimit({windowMs:15*60*1000,limit:12,standardHeaders:true,legacyHeaders:false,message:{error:'Too many attempts. Try again in 15 minutes.'}});
const signToken=user=>jwt.sign({sub:user._id},process.env.JWT_SECRET,{expiresIn:'7d'});
const clean=s=>typeof s==='string'?s.trim().slice(0,100):s;
router.get('/health',(req,res)=>res.json({status:'ok',database:!!req.app.locals.dbConnected,model:!!modelInfo()}));
router.get('/model',(_req,res)=>res.json(modelInfo()?{trained:true,...modelInfo()}:{trained:false,message:'Download the UCI dataset and train the JavaScript model to enable predictions.'}));
router.post('/auth/register',authLimit,async(req,res,next)=>{try{
  if(!req.app.locals.dbConnected) return res.status(503).json({error:'Database is not configured. Add MONGODB_URI to .env.'});
  const {name,email,password,studentId}=req.body;
  if(!name||name.trim().length<2||!/^\S+@\S+\.\S+$/.test(email||'')||typeof password!=='string'||password.length<8) return res.status(400).json({error:'Enter a name, valid email and password with at least 8 characters.'});
  if(await User.exists({email:email.toLowerCase()})) return res.status(409).json({error:'An account with that email already exists.'});
  const role=email.toLowerCase()===process.env.ADMIN_EMAIL?.toLowerCase()?'admin':'student';
  const user=await User.create({name:clean(name),email:email.toLowerCase(),passwordHash:await bcrypt.hash(password,12),studentId:clean(studentId),role});
  res.status(201).json({token:signToken(user),user:{id:user._id,name:user.name,email:user.email,role:user.role}});
}catch(e){next(e);}});
router.post('/auth/login',authLimit,async(req,res,next)=>{try{
  if(!req.app.locals.dbConnected) return res.status(503).json({error:'Database is not configured. Add MONGODB_URI to .env.'});
  const user=await User.findOne({email:(req.body.email||'').toLowerCase()}).select('+passwordHash');
  if(!user||!await bcrypt.compare(req.body.password||'',user.passwordHash)) return res.status(401).json({error:'Email or password is incorrect.'});
  res.json({token:signToken(user),user:{id:user._id,name:user.name,email:user.email,role:user.role}});
}catch(e){next(e);}});
router.get('/auth/me',authenticate,(req,res)=>res.json({user:req.user}));
router.post('/predict',async(req,res,next)=>{try{
  const b=req.body; const numeric=['age','studytime','absences','failures','Medu','Fedu','freetime'];
  for(const k of numeric) if(!Number.isFinite(Number(b[k]))||Number(b[k])<0||Number(b[k])> (k==='absences'?500:k==='age'?100:k==='studytime'?4:k==='failures'?4:k==='freetime'?5:4)) return res.status(400).json({error:`${k} is outside its allowed range.`});
  const features={school:b.school||'GP',sex:b.gender==='Female'?'F':'M',age:Number(b.age),address:b.address||'U',famsize:b.famsize||'GT3',Pstatus:b.Pstatus||'T',Medu:Number(b.Medu),Fedu:Number(b.Fedu),Mjob:b.Mjob||'other',Fjob:b.Fjob||'other',reason:b.reason||'course',guardian:b.guardian||'mother',traveltime:Number(b.traveltime||1),studytime:Number(b.studytime),failures:Number(b.failures),schoolsup:b.schoolsup||'no',famsup:b.famsup||'no',paid:b.paid||'no',activities:b.activities||'no',nursery:b.nursery||'yes',higher:b.higher||'yes',internet:b.internet||'yes',romantic:b.romantic||'no',famrel:Number(b.famrel||3),freetime:Number(b.freetime),goout:Number(b.goout||3),Dalc:Number(b.Dalc||1),Walc:Number(b.Walc||2),health:Number(b.health||3),absences:Number(b.absences)};
  const result=predict(features);
  const record={student:{name:clean(b.name),studentId:clean(b.studentId),age:Number(b.age),gender:clean(b.gender),level:clean(b.level)},behaviour:{studytime:Number(b.studytime),absences:Number(b.absences),failures:Number(b.failures),activities:features.activities,internet:features.internet,famsup:features.famsup,freetime:Number(b.freetime),schoolsup:features.schoolsup,Medu:features.Medu,Fedu:features.Fedu},...result,model:modelInfo().algorithm};
  if(req.app.locals.dbConnected){if(!req.headers.authorization) return res.status(401).json({error:'Sign in to save predictions to your history.'});const token=req.headers.authorization.replace(/^Bearer\s+/i,'');const payload=jwt.verify(token,process.env.JWT_SECRET);record.user=payload.sub;const saved=await Prediction.create(record);return res.json({id:saved._id,...result,student:record.student,behaviour:record.behaviour,createdAt:saved.createdAt,model:record.model});}
  return res.json({id:`local-${Date.now()}`,...result,student:record.student,behaviour:record.behaviour,createdAt:new Date().toISOString(),model:record.model,notice:'Preview only: MongoDB is not connected, so this result was not saved.'});
}catch(e){if(e.name==='JsonWebTokenError'||e.name==='TokenExpiredError')return res.status(401).json({error:'Please sign in again.'});next(e);}});
router.get('/predictions',authenticate,async(req,res,next)=>{try{const items=await Prediction.find(req.user.role==='admin'?{}:{user:req.user._id}).sort({createdAt:-1}).limit(100).populate('user','name email');res.json(items);}catch(e){next(e);}});
router.get('/admin/summary',authenticate,adminOnly,async(_req,res,next)=>{try{const [students,predictions,distribution,recent]=await Promise.all([User.countDocuments({role:'student'}),Prediction.countDocuments(),Prediction.aggregate([{$group:{_id:'$category',count:{$sum:1}}}]),Prediction.find().sort({createdAt:-1}).limit(8).populate('user','name email')]);res.json({students,predictions,distribution,recent,model:modelInfo()});}catch(e){next(e);}});
router.get('/admin/students',authenticate,adminOnly,async(_req,res,next)=>{try{res.json(await User.find({role:'student'}).select('name email studentId createdAt').sort({createdAt:-1}).limit(200));}catch(e){next(e);}});
export default router;
