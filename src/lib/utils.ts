import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
export const money = (value: number, currency = 'EUR') => new Intl.NumberFormat('fr-FR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
export const date = (value: string | null | undefined) => value ? new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '—';
export const longDate = (value: Date | string = new Date()) => new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(value));

/**
 * Database codes stay in English so the schema, jobs and provider payloads keep one vocabulary;
 * only what a reader sees is translated. Unlisted codes fall back to a readable form.
 */
const LABELS: Record<string, string> = {
  // Statuts de lead et étapes du pipeline
  DISCOVERED: 'Découvert', WATCH: 'À surveiller', IGNORE: 'Écarté', REVIEW: 'À valider', QUALIFIED: 'Qualifié',
  CONTACTED: 'Contacté', REPLIED: 'A répondu', INTERESTED: 'Intéressé', MEETING: 'Rendez-vous', PROPOSAL: 'Proposition',
  WON: 'Gagné', LOST: 'Perdu', BLACKLISTED: 'Liste noire',
  // Statuts d'entreprise
  NEW: 'Nouvelle', ENRICHING: 'Enrichissement', RESEARCHED: 'Recherche faite',
  // Statuts de message
  DRAFT: 'Brouillon', APPROVED: 'Approuvé', DEFERRED: 'Reporté', SENDING: 'Envoi en cours', SENT: 'Envoyé',
  DELIVERED: 'Délivré', SIMULATED: 'Simulé', BOUNCED: 'Rejeté', COMPLAINED: 'Plainte spam', SUPPRESSED: 'Bloqué',
  SEND_UNCERTAIN: 'Envoi incertain', CANCELLED: 'Annulé', REJECTED: 'Refusé', RECEIVED: 'Reçu', FAILED: 'Échec',
  PROCESSING: 'En traitement', PROCESSED: 'Traité',
  // Types et sens de message
  INITIAL: 'Premier email', FOLLOWUP: 'Relance', REPLY: 'Réponse', OUTBOUND: 'Sortant', INBOUND: 'Entrant',
  // Classification des réponses
  POSITIVE: 'Positive', QUESTION: 'Question', NOT_NOW: 'Pas maintenant', NOT_INTERESTED: 'Pas intéressé',
  REFERRAL: 'Renvoi vers un collègue', MEETING_REQUEST: 'Demande de rendez-vous', NEGOTIATION: 'Négociation',
  UNSUBSCRIBE: 'Désinscription', OUT_OF_OFFICE: 'Absence', UNKNOWN: 'Indéterminé', HUMAN: 'Rédigé par vous',
  NEUTRAL: 'Neutre',
  // File de validation et conversations
  PENDING: 'En attente', HANDED_OFF: 'Repris en main', HANDOFF: 'Reprise humaine', OPEN: 'Ouverte', CLOSED: 'Close',
  OUTREACH: 'Approche commerciale', QUALIFICATION: 'Qualification', DELIVERY: 'Délivrabilité',
  SEND_SAFETY: 'Sécurité d’envoi', INBOUND_AUTH: 'Authentification expéditeur', OPPORTUNITY: 'Opportunité',
  // Campagnes
  ACTIVE: 'Active', PAUSED: 'En pause', COMPLETED: 'Terminée',
  // Contacts et sources
  VERIFIED: 'Vérifié', INVALID: 'Invalide', DEMO: 'Démonstration', COMPLAINT: 'Plainte',
  TAVILY: 'Recherche web', HUNTER: 'Hunter', MANUAL_CSV: 'Import CSV', EMAIL_ALERT: 'Alerte email',
  DEVELOPMENT_FIXTURE: 'Jeu de démonstration', MANUAL: 'Manuel',
  CONNECTED: 'Connecté', NOT_CONNECTED: 'Non connecté',
  // Niveaux de journal
  INFO: 'Info', WARN: 'Avertissement', ERROR: 'Erreur',
  // Actions du journal d’activité
  LEAD_DISCOVERED: 'Lead découvert', DISCOVERY_COMPLETED: 'Recherche terminée', CSV_IMPORTED: 'CSV importé',
  COMPANY_ENRICHMENT_STARTED: 'Enrichissement lancé', CONTACT_FOUND: 'Contact trouvé',
  CONTACT_NOT_FOUND: 'Aucun contact trouvé', CONTACT_DISCOVERY_DISABLED: 'Recherche de contact désactivée',
  RESEARCH_COMPLETED: 'Recherche documentée', LEAD_SCORED: 'Lead scoré', OFFER_GENERATED: 'Offre générée',
  OUTREACH_GENERATED: 'Email rédigé', SEND_CLAIMED: 'Envoi réservé', EMAIL_SIMULATED: 'Email simulé',
  EMAIL_SENT: 'Email envoyé', EMAIL_DELIVERED: 'Email délivré', EMAIL_SUPPRESSION: 'Adresse bloquée',
  EMAIL_DELIVERY_ISSUE: 'Incident de délivrabilité', EMAIL_SEND_UNCERTAIN: 'Envoi incertain',
  SEND_BLOCKED: 'Envoi bloqué', REPLY_CLASSIFIED: 'Réponse classée',
  STALE_REPLY_CLASSIFIED: 'Réponse dépassée classée', REPLY_ON_SUPPRESSED_LEAD: 'Réponse sur contact bloqué',
  OUT_OF_OFFICE_SCHEDULED: 'Relance reportée', LEAD_BLACKLISTED: 'Lead mis en liste noire',
  REVIEW_RESOLVED: 'Validation traitée', REVIEW_EDITED: 'Message modifié',
  EMAIL_ALERT_RECEIVED: 'Alerte email reçue', EMAIL_ALERT_SOURCE_DISABLED: 'Source d’alertes désactivée',
  INBOUND_REVIEW_REQUIRED: 'Email entrant à vérifier', INBOUND_AUTH_FAILED: 'Authentification entrante en échec',
  WEBHOOK_FAILED: 'Webhook en échec', PROVIDER_BUDGET_REACHED: 'Budget fournisseur atteint',
  AI_DEGRADED: 'IA indisponible, repli local', SETTINGS_UPDATED: 'Réglages mis à jour', LEAD_SEEDED: 'Lead de démonstration',
  // Actions déclenchées depuis l’interface
  USER_DISCOVER: 'Recherche lancée', USER_PROCESS_LEAD: 'Enrichissement demandé',
  USER_GENERATE_OUTREACH: 'Rédaction demandée', USER_SEND_MESSAGE: 'Envoi demandé',
  USER_SIMULATE_REPLY: 'Réponse simulée', USER_COMPOSE_REPLY: 'Réponse rédigée à la main',
  USER_FOLLOWUPS: 'Relances déclenchées', USER_IMPORT_CSV: 'Import CSV', USER_REVIEW: 'Décision de validation',
  USER_BLACKLIST: 'Mise en liste noire', USER_CREATE_CAMPAIGN: 'Campagne créée',
  USER_UPDATE_CAMPAIGN: 'Campagne modifiée', USER_MOVE_DEAL: 'Opportunité déplacée',
  USER_SAVE_SETTINGS: 'Réglages enregistrés', USER_UPDATE_MESSAGE: 'Message modifié',
  USER_UPDATE_SOURCE: 'Source modifiée',
};
export const label = (value: string) => LABELS[value.toUpperCase().replace(/[.\s-]/g, '_')] ?? value.toLowerCase().replaceAll('_', ' ').replace(/^./, c => c.toUpperCase());
