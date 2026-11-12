import { Link } from "react-router-dom";
import { Shell } from "../app/Shell";

export default function Workspace() {
  return <Shell>
    <p className="nf-overline">COMMUNITY FUNDING / WORKSPACE</p>
    <h1 className="nf-heading">Make local projects possible.</h1>
    <p className="nf-muted">Plan, fund and track meaningful improvements in your neighbourhood.</p>
    <div className="nf-overview-grid">
      <section className="nf-card" aria-labelledby="project-heading"><h2 id="project-heading">Project workspace</h2><p className="nf-muted">Project creation, budgets, milestones, feasibility and household allocation remain accessible while we migrate them into dedicated pages.</p><Link to="/legacy">Open working dashboard</Link></section>
      <section className="nf-card" aria-labelledby="integration-heading"><h2 id="integration-heading">Integration status</h2><p className="nf-muted">Payment, evidence, release and attestation workflows will be connected to real backend contracts. No financial transaction is implied by this interface.</p></section>
    </div>
  </Shell>;
}
