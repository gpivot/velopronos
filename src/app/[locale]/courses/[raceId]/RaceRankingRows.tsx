import { CheckIcon } from "@/components/icons";
import { nationFlagEmoji } from "@/lib/nationFlags";
import { CalcDetail, FuseeGachetteBadges, formatPoints } from "@/components/PredictionBreakdown";
import type { RaceResultRow } from "@/lib/lastResult";
import type { OngoingBoardRow, RacePlayerRow } from "@/lib/racePlayers";
import { ShootingDots } from "@/components/ShootingDots";
import { PlayerRaceButton } from "./PlayerRaceButton";
import { PickShareBar } from "@/components/PickShareBar";

/** Ligne du classement de la course : étoile et contour doré pour le trio du Prono parfait. */
export function ResultRow({ row, share }: { row: RaceResultRow; share?: { percent: number; label: string } | null }) {
  return (
    <div
      className={`group relative isolate flex items-center gap-3.5 rounded-2xl border px-4 py-3 ${
        row.perfect ? "border-gold" : row.mine ? "border-ice/60" : "border-border"
      } ${row.mine ? "bg-ice-soft" : "bg-card"}`}
    >
      {share && <PickShareBar percent={share.percent} label={share.label} />}
      <div
        className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full font-display text-xs font-bold ${
          row.rank === 1 ? "bg-gold-soft text-gold" : "bg-ice-soft text-ice"
        }`}
      >
        {row.rank}
      </div>
      <div className="text-base">{nationFlagEmoji(row.nationCode)}</div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-w-0 items-center gap-1 truncate text-sm font-semibold">
          <span className="truncate">{row.name}</span>
          {row.perfect && <span className="text-[13px]">⭐</span>}
          <FuseeGachetteBadges skiRank={row.skiRank} gachette={row.gachette} />
        </div>
        {row.points != null && <CalcDetail odds={row.odds} rankMultiplier={row.rankMultiplier} />}
      </div>
      <ShootingDots shootings={row.shootings} />
      {row.mine && <CheckIcon className="h-4 w-4 flex-shrink-0 text-ice" />}
      {row.points != null && (
        <div className="whitespace-nowrap font-display text-[13px] font-bold text-gold">{formatPoints(row.points)}</div>
      )}
    </div>
  );
}

/** Ligne du classement des joueurs : cliquable, ouvre le pronostic détaillé du joueur. */
export function PlayerRow({ player, mine, raceId }: { player: RacePlayerRow; mine: boolean; raceId: string }) {
  return (
    <PlayerRaceButton
      raceId={raceId}
      userId={player.userId}
      className={`flex items-center gap-3.5 rounded-2xl border px-4 py-3 ${mine ? "border-ice/60 bg-ice-soft" : "border-border bg-card"}`}
    >
      <div
        className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full font-display text-xs font-bold ${
          player.rank === 1 ? "bg-gold-soft text-gold" : "bg-ice-soft text-ice"
        }`}
      >
        {player.rank}
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-1.5 text-sm font-semibold">
        <span className="truncate">{player.pseudo}</span>
        {/* Meilleur pronostiqueur de la course : la bouteille de champagne, comme dans le Classement. */}
        {player.rank === 1 && player.points > 0 && <span className="text-[13px]">🍾</span>}
      </div>
      <div className="whitespace-nowrap font-display text-[13px] font-bold text-ice">{Math.round(player.points * 10) / 10} pts</div>
    </PlayerRaceButton>
  );
}

/** Course en cours : place au général, pseudo, et sous le nom son pronostic sur cette course. */
export function OngoingBoardRowView({ row, mine, noPredictionLabel }: { row: OngoingBoardRow; mine: boolean; noPredictionLabel: string }) {
  return (
    <div className={`flex items-center gap-3.5 rounded-2xl border px-4 py-3 ${mine ? "border-ice/60 bg-ice-soft" : "border-border bg-card"}`}>
      <div
        className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full font-display text-xs font-bold ${
          row.rank === 1 ? "bg-gold-soft text-gold" : "bg-ice-soft text-ice"
        }`}
      >
        {row.rank}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="truncate text-sm font-semibold">{row.pseudo}</div>
        <div className={`truncate text-xs ${row.picks ? "text-frost" : "text-text-dim"}`}>{row.picks ?? noPredictionLabel}</div>
      </div>
      <div className="whitespace-nowrap font-display text-[13px] font-bold text-ice">{Math.round(row.points * 10) / 10} pts</div>
    </div>
  );
}
