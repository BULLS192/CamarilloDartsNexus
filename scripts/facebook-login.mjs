import path from 'node:path';
import { chromium } from 'playwright';

const PROFILE_DIR=process.env.NEXUS_FB_PROFILE_DIR?path.resolve(process.env.NEXUS_FB_PROFILE_DIR):'';
if(!PROFILE_DIR){
  throw new Error('Set NEXUS_FB_PROFILE_DIR before running this command. Example: $env:NEXUS_FB_PROFILE_DIR="$HOME\\.nexus-facebook-profile"');
}

const context=await chromium.launchPersistentContext(PROFILE_DIR,{
  headless:false,
  viewport:{width:1440,height:1100}
});
const pages=context.pages();
const page=pages[0]||await context.newPage();
await page.goto('https://www.facebook.com/',{waitUntil:'domcontentloaded',timeout:45000});

console.log('\nNEXUS Facebook login helper');
console.log('1. Log into Facebook yourself in the opened browser.');
console.log('2. Complete any 2FA/checkpoints yourself.');
console.log('3. Confirm you can see your normal Facebook home feed.');
console.log('4. Close the browser window when finished.');
console.log('No password, token, or recovery code is collected by this script.\n');

await new Promise(resolve=>context.on('close',resolve));
console.log('Facebook browser profile closed. Session data remains only in your local profile directory.');
