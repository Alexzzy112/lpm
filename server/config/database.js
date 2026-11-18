import mongoose from 'mongoose';
export async function connectDatabase() {
  if(!process.env.MONGODB_URI) { console.warn('MONGODB_URI missing: account and history endpoints are unavailable.'); return false; }
  await mongoose.connect(process.env.MONGODB_URI,{serverSelectionTimeoutMS:7000});
  console.log('MongoDB connected.'); return true;
}
