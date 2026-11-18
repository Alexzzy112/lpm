import jwt from 'jsonwebtoken';
import User from '../models/User.js';
export async function authenticate(req,res,next) {
  try {
    const token=req.headers.authorization?.replace(/^Bearer\s+/i,'');
    if(!token) return res.status(401).json({error:'Please sign in to continue.'});
    const payload=jwt.verify(token,process.env.JWT_SECRET);
    req.user=await User.findById(payload.sub).select('_id name email role studentId');
    if(!req.user) return res.status(401).json({error:'Account no longer exists.'});
    next();
  } catch { return res.status(401).json({error:'Your session has expired. Please sign in again.'}); }
}
export const adminOnly=(req,res,next)=>req.user?.role==='admin'?next():res.status(403).json({error:'Administrator access required.'});
