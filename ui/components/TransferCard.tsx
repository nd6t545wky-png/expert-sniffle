/**
 * Engine or mound.
 *
 * The whole "is it mechanics or is it strength" question turns on one
 * comparison the app already had the ingredients for: the best pulldown
 * against the best mound reading. This shows it, and says which of the two
 * stories the numbers currently support — including, honestly, "neither yet".
 *
 * Placed on the plan rather than buried in progress, because its job is to
 * change what the next block is aimed at.
 */

import { Transfer } from "../../src/domain/velocityTransfer";
import { Card, CardHead } from "./Page";

const TONE: Record<Transfer["scenario"], string> = {
  unknown: "unknown",
  engine: "engine",
  transfer: "transfer",
  borderline: "borderline",
};

const LABEL: Record<Transfer["scenario"], string> = {
  unknown: "Not yet known",
  engine: "Engine-limited",
  transfer: "Transfer loss",
  borderline: "Between the two",
};

export function TransferCard({ transfer }: { transfer: Transfer }) {
  return (
    <Card>
      <CardHead
        title="Mound vs pulldown"
        detail="The one comparison that decides whether the next block chases the engine or the mound."
      />

      <div className={`transfer-head tone-${TONE[transfer.scenario]}`}>
        <span className="transfer-chip">{LABEL[transfer.scenario]}</span>
        <strong>{transfer.headline}</strong>
      </div>

      <div className="transfer-pair">
        <div>
          <dt>Mound best</dt>
          <dd>{transfer.mound ? `${transfer.mound.mph} mph` : "—"}</dd>
          <small>{transfer.mound ? transfer.mound.on : "no reading yet"}</small>
        </div>
        <div>
          <dt>Pulldown best</dt>
          <dd>{transfer.pulldown ? `${transfer.pulldown.mph} mph` : "—"}</dd>
          <small>{transfer.pulldown ? transfer.pulldown.on : "no reading yet"}</small>
        </div>
        <div>
          <dt>Gap</dt>
          <dd>{transfer.gap === null ? "—" : `${transfer.gap > 0 ? "+" : ""}${transfer.gap} mph`}</dd>
          <small>pulldown over mound</small>
        </div>
      </div>

      <p className="transfer-detail">{transfer.detail}</p>
    </Card>
  );
}
