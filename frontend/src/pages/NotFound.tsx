import { Link } from "react-router-dom";
import { Shell } from "../app/Shell";

export default function NotFound() {
  return <Shell><h1 className="nf-heading">Page not found</h1><p className="nf-muted">The requested page does not exist.</p><Link to="/workspace">Return to workspace</Link></Shell>;
}
