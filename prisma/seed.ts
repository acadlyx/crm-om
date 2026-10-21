import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, UserRole } from "../generated/prisma/client";
import { hash } from "bcryptjs";

const connectionString=process.env.DATABASE_URL;
if(!connectionString)throw new Error("DATABASE_URL is required to seed.");
const prisma=new PrismaClient({adapter:new PrismaPg({connectionString})});
async function main(){
  const email=process.env.PLATFORM_ADMIN_EMAIL?.trim().toLowerCase();
  const password=process.env.PLATFORM_ADMIN_PASSWORD;
  if(email&&password){
    if(password.length<12)throw new Error("PLATFORM_ADMIN_PASSWORD must be at least 12 characters.");
    const passwordHash=await hash(password,12);
    await prisma.user.upsert({where:{email},update:{name:process.env.PLATFORM_ADMIN_NAME||"Platform Administrator",role:UserRole.PLATFORM_ADMIN,passwordHash,tenantId:null},create:{email,passwordHash,name:process.env.PLATFORM_ADMIN_NAME||"Platform Administrator",role:UserRole.PLATFORM_ADMIN}});
  }
  await prisma.platformSettings.upsert({where:{id:"global"},update:{},create:{id:"global"}});
}
main().finally(()=>prisma.$disconnect());
