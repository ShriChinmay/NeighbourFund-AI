import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Shell } from '../app/Shell';
import { usePublicProject } from '../features/public-projects/usePublicProject';
import { money } from '../features/projects/contracts';
import { paymentCapability,validateContribution } from '../features/contributions/contracts';
import './public-project.css';

export default function Contribute(){
 const {id=''}=useParams();const {project,validId}=usePublicProject(id);
 const [amount,setAmount]=useState('25.00');const [message,setMessage]=useState('');
 const data=project.data?.project;
 function review(){try{const v=validateContribution({kind:'resident',amount},data?.status??'',[]);setMessage(`Amount checked: ${money(v.amountMinor)}. ${paymentCapability.reason} No payment was created.`);}catch(error){setMessage(error instanceof Error?error.message:'Invalid contribution');}}
 return <Shell><p className="nf-overline">COMMUNITY / RESIDENTS</p><h1 className="nf-heading">Resident contribution</h1>
 {!validId?<p role="alert">Invalid project link.</p>:<>
 {project.isPending&&<p>Loading project...</p>}{project.isError&&<p role="alert">{project.error.message}</p>}
 {data&&<><section className="nf-card"><h2>{data.title}</h2><p>{data.communityName}</p><p><strong>Funding goal:</strong> {money(data.goalMinor)} · <strong>Status:</strong> {data.status}</p><p className="nf-muted">A funding goal is not the amount collected.</p></section>
 <section className="nf-card"><h2>Contribution details</h2><p>Choose a proposed contribution amount. Payment processing is not yet connected.</p><div className="nf-contribute-form"><label>Contribution (USD)<input inputMode="decimal" value={amount} onChange={e=>{setAmount(e.target.value);setMessage('');}}/></label><button type="button" onClick={review}>Review amount</button></div>{message&&<p role="status">{message}</p>}
 <button type="button" disabled aria-label="PayPal checkout unavailable">Continue to PayPal — unavailable</button><p className="nf-muted">No funds will be charged or reserved. Do not share payment credentials here.</p></section><p><Link to={`/p/${id}`}>Back to public project</Link></p></>}
 </>}</Shell>;
}
