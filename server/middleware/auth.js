import jwt from 'jsonwebtoken';
import User from '../models/User.js';
export async function authenticate(req,res,next) {
  try {
    const token=req.headers.authorization?.replace(/^Bearer\s+/i,'');
    if(!token) return res.status(401).json({error:'Please sign in to continue.'});
    const payload=jwt.verify(token,process.env.JWT_SECRET);
    req.user=await User.findById(payload.sub).select('_id name email role studentId approvalStatus');
    if(!req.user) return res.status(401).json({error:'Account no longer exists.'});
    if(req.user.role==='student'&&req.user.approvalStatus==='pending') return res.status(403).json({error:'Your account is awaiting administrator approval.'});
    if(req.user.role==='student'&&req.user.approvalStatus==='rejected') return res.status(403).json({error:'Your registration was rejected. Please contact an administrator.'});
    next();
  } catch { return res.status(401).json({error:'Your session has expired. Please sign in again.'}); }
}
export const adminOnly=(req,res,next)=>req.user?.role==='admin'?next():res.status(403).json({error:'Administrator access required.'});
