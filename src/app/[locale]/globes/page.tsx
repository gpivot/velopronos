import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";

/** VéloPronos : plus de pronostics de saison (globes) ; l'ancienne adresse mène aux choix de cœur. */
export default async function GlobesPage() {
  redirect({ href: "/coeur", locale: await getLocale() });
}
