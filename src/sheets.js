export async function pushDatabaseToSheets(webhookUrl,payload){
  const url=String(webhookUrl||'').trim();if(!url)throw new Error('Google Sheets Web App URL is not configured.');if(!/^https:\/\/script\.google\.com\/macros\/s\//i.test(url))throw new Error('Use the deployed Google Apps Script Web App URL.');
  const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'replaceDatabase',payload})});const text=await response.text();let data;try{data=JSON.parse(text)}catch{data={ok:response.ok,message:text.slice(0,300)}}if(!response.ok||data.ok===false)throw new Error(data.error||data.message||`Sheets sync failed (${response.status})`);return data;
}
