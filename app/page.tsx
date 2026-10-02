import Link from "next/link";


export default function Home() {
  const cards = [
    {n:"Maya",u:"@mayamoves",p:"GlowSkin",t:"Product video",c:"violet",x:"12%",y:"18%",d:"18s"},
    {n:"Jay",u:"@jaycreates",p:"Volt Energy",t:"Brand mention",c:"cyan",x:"62%",y:"12%",d:"22s"},
    {n:"Nia",u:"@nia.style",p:"Nova Sneakers",t:"Product placement",c:"lime",x:"40%",y:"56%",d:"20s"},
    {n:"Leo",u:"@leovision",p:"Streamly",t:"App promotion",c:"pink",x:"78%",y:"58%",d:"24s"},
    {n:"Zara",u:"@zaracreates",p:"Luma Beauty",t:"Sponsored video",c:"blue",x:"4%",y:"65%",d:"21s"}
  ];
  return <main className="page">
    <div className="aurora a1"/><div className="aurora a2"/><div className="gridGlow"/>
    <nav className="nav"><div className="logo"><span className="logoMark">A</span><span>AD<span>BRIDGE</span></span></div><div className="navLinks"><a href="#how">How it works</a><a href="#creators">Creators</a><a href="#brands">Brands</a><Link className="ghost" href="/login">Sign in</Link><Link className="ghost" href="/advertiser">Advertiser</Link><Link className="ghost" href="/publisher">Publisher</Link><Link className="navCta" href="/creator">Creator</Link></div><button className="menu">☰</button></nav>
    <section className="hero"><div className="heroCopy"><div className="eyebrow"><i/> THE CREATOR AD NETWORK</div><h1>Brands move.<br/><em>Creators make</em><br/>it happen.</h1><p>AdBridge connects brands with creators who turn products into content people actually want to watch.</p><div className="actions"><Link className="primary" href="/advertiser">I’m an Advertiser <b>↗</b></Link><Link className="secondary" href="/creator">I’m a Creator <b>→</b></Link></div><div className="proof"><span><strong>10K+</strong> creators</span><span><strong>24/7</strong> campaigns</span><span><strong>∞</strong> possibilities</span></div></div>
      <div className="scene">{cards.map((c,i)=><div key={c.n} className={"creatorCard "+c.c} style={{left:c.x,top:c.y,animationDelay:(-i*2)+"s",animationDuration:c.d}}><div className="fakeVideo"><div className="scan"/><div className="person"><div className="head"/><div className="body"/></div><div className="productGlow">{c.p}</div><div className="play">▶</div></div><div className="cardInfo"><div><b>{c.n}</b><small>{c.u}</small></div><span>{c.t}</span></div></div>)}</div>
    </section>
    <section className="ticker"><div>CREATORS <b>✦</b> PRODUCTS <b>✦</b> STORIES <b>✦</b> CAMPAIGNS <b>✦</b> AUDIENCES <b>✦</b> CREATORS <b>✦</b> PRODUCTS <b>✦</b> STORIES <b>✦</b></div></section>
    <section id="how" className="how"><div><span className="eyebrow">ONE PLACE. TWO SIDES.</span><h2>From product idea<br/>to <em>real attention.</em></h2></div><div className="steps"><article><span>01</span><h3>Brands start a campaign</h3><p>Tell creators exactly what you want shown, said, linked or made.</p></article><article><span>02</span><h3>Creators make it real</h3><p>Choose campaigns that fit your audience and create the content.</p></article><article><span>03</span><h3>Work gets approved</h3><p>When the work is approved, the creator gets paid.</p></article></div></section>
    <section id="brands" className="bottom"><div><span className="eyebrow">FOR ADVERTISERS</span><h2>Put your product<br/><em>inside the story.</em></h2></div><Link className="primary" href="/advertiser">Open Advertiser Dashboard ↗</Link></section>
    <footer><div className="logo"><span className="logoMark">A</span><span>AD<span>BRIDGE</span></span></div><p>Where brands meet creators.</p><span>© 2026 AdBridge</span></footer>
  </main>;
}