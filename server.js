import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectDatabase } from './server/config/database.js';
import api from './server/routes/api.js';

if(!process.env.JWT_SECRET||process.env.JWT_SECRET.length<24){console.error('Set JWT_SECRET (at least 24 characters) in .env.');process.exit(1);}
const app=express(); const root=path.dirname(fileURLToPath(import.meta.url));
app.disable('x-powered-by'); app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'",'https://cdn.jsdelivr.net'],styleSrc:["'self'","'unsafe-inline'",'https://fonts.googleapis.com'],fontSrc:["'self'",'data:','https://fonts.gstatic.com'],imgSrc:["'self'",'data:'],connectSrc:["'self'"]}}}));
app.use(express.json({limit:'32kb'})); app.use('/api',api); app.use(express.static(path.join(root,'public')));
app.get('*',(_req,res)=>res.sendFile(path.join(root,'public/index.html')));
app.use((err,_req,res,_next)=>{console.error(err);res.status(500).json({error:'Something went wrong. Please try again.'});});
const port=Number(process.env.PORT)||3000;
try{app.locals.dbConnected=await connectDatabase();}catch(e){console.error('MongoDB connection failed:',e.message);app.locals.dbConnected=false;}
app.listen(port,()=>console.log(`Student performance app listening on http://localhost:${port}`));
