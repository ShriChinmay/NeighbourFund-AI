import { useState } from 'react';
import { Link,useParams } from 'react-router-dom';
import { Shell } from '../app/Shell';
import { usePublicProject } from '../features/public-projects/usePublicProject';
import { money } from '../features/projects/contracts';
import { paymentCapability,validateContribution } from '../features/contributions/contracts';
import './public-project.css';
export default function Sponsor(){
 const {id=''}=useParams();const {project,slots,validId}=usePublicProject(id);
 const [slotId,setSlotId]=useState('');const [amount,setAmount]=useState('');const [message,setMessage]=useState('');const data=project.data?.project;
 function review(){try{const v=validateContribution({kind:'sponsor',amount,slotId},data?.status??'',slots.data?.slots.map(s=>s.id)??[]);setMessage(`Proposed sponsorship: ${money(v.amountMinor)}. ${paymentCapability.reason} No pledge or payment was recorded.`);}catch(error){setMessage(error instanceof Error?error.message:'Invalid sponsorship');}}
 return <Shell><p className="nf-overline">COMMUNITY / SPONSORS</p><h1 className="nf-heading">Sponsor a project</h1>
 {!validId?<p role="alert">Invalid project link.</p>:<>{project.isPending&&<p>Loading project...</p>}{project.isError&&<p role="alert">{project.error.message}</p>}{data&&<><section className="nf-card"><h2>{data.title}</h2><p>{data.communityName} · {data.status}</p><p><strong>Goal:</strong> {money(data.goalMinor)}</p><p className="nf-muted">Listed slot values are budget allocations, not confirmed unmet balances.</p></section>
 <section className="nf-card"><h2>Budget sponsorship slots</h2>{slots.isPending?<p>Loading slots...</p>:slots.isError?<p role="alert">{slots.error.message}</p>:slots.data?.slots.length?<div className="nf-public-slots">{slots.data.slots.map(s=><article key={s.id}><h3>{s.label}</h3><strong>{money(s.amountMinor)}</strong><p>Status: {s.status}</p><button type="button" onClick={()=>{setSlotId(s.id);setAmount((Number(s.amountMinor)/100).toFixed(2));setMessage('');}}>Select this slot</button></article>)}</div>:<p>No funding slots published yet.</p>}</section>
 <section className="nf-card"><h2>Sponsorship review</h2><div className="nf-contribute-form"><label>Selected slot<select value={slotId} onChange={e=>{setSlotId(e.target.value);setMessage('');}}><option value="">Choose a slot</option>{slots.data?.slots.map(s=><option key={s.id} value={s.id}>{s.label} — {money(s.amountMinor)}</option>)}</select></label><label>Proposed amount (USD)<input inputMode="decimal" value={amount} onChange={e=>{setAmount(e.target.value);setMessage('');}}/></label><button type="button" onClick={review}>Review sponsorship</button></div>{message&&<p role="status">{message}</p>}<button disabled type="button">Sponsor checkout unavailable</button><p className="nf-muted">Selecting a slot does not reserve it or record a sponsorship.</p></section><p><Link to={`/p/${id}`}>Back to public project</Link></p></>}</>}
 </Shell>;
}
