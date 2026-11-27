import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const script = `(function(){var s=document.currentScript;if(!s)return;var id=s.dataset&&s.dataset.campaign;if(!id)return;var d=(s.dataset&&s.dataset.destination)||"web";var allowed=["web","web_app","android_app","ios_app"];if(!allowed.includes(d))return;var f=document.createElement("iframe");f.src=${JSON.stringify(origin)}+"/ad/"+encodeURIComponent(id)+"?destination="+encodeURIComponent(d);f.title="AdBridge sponsored advertisement";f.loading="lazy";f.referrerPolicy="strict-origin-when-cross-origin";f.style.width="100%";f.style.minHeight="180px";f.style.border="0";f.style.display="block";f.setAttribute("sandbox","allow-scripts allow-same-origin allow-popups");s.parentNode&&s.parentNode.insertBefore(f,s.nextSibling);})();`;
  return new NextResponse(script, {
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "public, max-age=300",
      "x-content-type-options": "nosniff",
    },
  });
}
