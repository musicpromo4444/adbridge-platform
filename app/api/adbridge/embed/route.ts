import { NextResponse } from "next/server";

export async function GET() {
  const script = '(function(){var s=document.currentScript;var id=s&&s.dataset&&s.dataset.campaign;if(!id)return;var d=s.dataset.destination||"web";var f=document.createElement("iframe");f.src="/ad/"+encodeURIComponent(id)+"?destination="+encodeURIComponent(d);f.title="AdBridge advertisement";f.loading="lazy";f.style.width="100%";f.style.minHeight="180px";f.style.border="0";f.style.display="block";s.parentNode&&s.parentNode.insertBefore(f,s.nextSibling);})();';
  return new NextResponse(script,{headers:{"content-type":"application/javascript; charset=utf-8","cache-control":"public, max-age=300"}});
}
