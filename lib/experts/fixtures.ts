import type { ExpertRow } from "@/lib/db/experts";

export const FIXTURE_EXPERTS: readonly ExpertRow[] = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    full_name: "Hery Rakoto Démo",
    title: "Médecin de santé publique",
    organization: "Ministère fictif de la Santé",
    org_type: "public_institution",
    domains: [
      "health",
      "statistics_demography"
    ],
    languages: [
      "mg",
      "fr"
    ],
    regions: [
      "analamanga"
    ],
    bio: "Profil fictif de démonstration. Santé publique, vaccination et données sanitaires à Madagascar.",
    contact_email: "hery.rakoto@example.com",
    contact_phone: "+261 00 000 00 01",
    consent_status: "granted",
    last_verified_at: "2026-08-15",
    is_fictional: true
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    full_name: "Soa Rasoanaivo Démo",
    title: "Enseignante-chercheuse en épidémiologie",
    organization: "Université fictive d'Antananarivo",
    org_type: "academic",
    domains: [
      "health",
      "education"
    ],
    languages: [
      "mg",
      "fr",
      "en"
    ],
    regions: [
      "analamanga"
    ],
    bio: "Profil fictif de démonstration. Épidémiologie, formation des soignants et santé communautaire.",
    contact_email: "soa.rasoanaivo@example.com",
    contact_phone: "+261 00 000 00 02",
    consent_status: "granted",
    last_verified_at: "2026-10-01",
    is_fictional: true
  },
  {
    id: "00000000-0000-4000-8000-000000000003",
    full_name: "Andry Ravelo Démo",
    title: "Avocat",
    organization: "Barreau fictif de Madagascar",
    org_type: "independent",
    domains: [
      "justice_law",
      "human_rights_gender"
    ],
    languages: [
      "mg",
      "fr"
    ],
    regions: [
      "analamanga"
    ],
    bio: "Profil fictif de démonstration. Droit pénal, accès à la justice et droits des personnes vulnérables.",
    contact_email: "andry.ravelo@example.com",
    contact_phone: "+261 00 000 00 03",
    consent_status: "public_info",
    last_verified_at: "2026-09-20",
    is_fictional: true
  },
  {
    id: "00000000-0000-4000-8000-000000000004",
    full_name: "Lalao Andrianina Démo",
    title: "Économiste",
    organization: "Observatoire fictif des politiques publiques",
    org_type: "independent",
    domains: [
      "economy_finance",
      "governance_politics"
    ],
    languages: [
      "mg",
      "fr",
      "en"
    ],
    regions: [],
    bio: "Profil fictif de démonstration. Budget public, fiscalité et politiques économiques nationales.",
    contact_email: "lalao.andrianina@example.com",
    contact_phone: "+261 00 000 00 04",
    consent_status: "granted",
    last_verified_at: "2026-10-20",
    is_fictional: true
  },
  {
    id: "00000000-0000-4000-8000-000000000005",
    full_name: "Tiana Rabe Démo",
    title: "Agronome",
    organization: "ONG fictive Tantely",
    org_type: "ngo",
    domains: [
      "agriculture_food",
      "environment_climate"
    ],
    languages: [
      "mg"
    ],
    regions: [
      "vakinankaratra"
    ],
    bio: "Profil fictif de démonstration. Cultures vivrières, semences et adaptation des exploitations familiales.",
    contact_email: "tiana.rabe@example.com",
    contact_phone: "+261 00 000 00 05",
    consent_status: "public_info",
    last_verified_at: "2026-07-12",
    is_fictional: true
  },
  {
    id: "00000000-0000-4000-8000-000000000006",
    full_name: "Miora Rakotondrabe Démo",
    title: "Chercheuse en environnement",
    organization: "Institut fictif de recherche sur le littoral",
    org_type: "academic",
    domains: [
      "environment_climate",
      "disaster_risk"
    ],
    languages: [
      "fr",
      "en"
    ],
    regions: [
      "atsinanana"
    ],
    bio: "Profil fictif de démonstration. Érosion côtière, mangroves et risques climatiques dans l'est.",
    contact_email: "miora.rakotondrabe@example.com",
    contact_phone: "+261 00 000 00 06",
    consent_status: "granted",
    last_verified_at: "2026-06-18",
    is_fictional: true
  },
  {
    id: "00000000-0000-4000-8000-000000000007",
    full_name: "Faly Randria Démo",
    title: "Ingénieur transports",
    organization: "Société fictive Transport+",
    org_type: "private",
    domains: [
      "infrastructure_transport",
      "energy"
    ],
    languages: [
      "mg",
      "fr"
    ],
    regions: [
      "boeny"
    ],
    bio: "Profil fictif de démonstration. Routes rurales, transport urbain et électrification des communes.",
    contact_email: "faly.randria@example.com",
    contact_phone: "+261 00 000 00 07",
    consent_status: "granted",
    last_verified_at: "2025-12-01",
    is_fictional: true
  },
  {
    id: "00000000-0000-4000-8000-000000000008",
    full_name: "Voahangy Ramiandrisoa Démo",
    title: "Présidente d'association",
    organization: "Association fictive Fanabeazana",
    org_type: "association",
    domains: [
      "education",
      "culture_society"
    ],
    languages: [
      "mg",
      "fr"
    ],
    regions: [
      "analamanga"
    ],
    bio: "Profil fictif de démonstration. Éducation de base, alphabétisation et médiation culturelle.",
    contact_email: "voahangy.ramiandrisoa@example.com",
    contact_phone: "+261 00 000 00 08",
    consent_status: "public_info",
    last_verified_at: "2026-09-05",
    is_fictional: true
  },
  {
    id: "00000000-0000-4000-8000-000000000009",
    full_name: "Toky Razafindrakoto Démo",
    title: "Journaliste spécialisé",
    organization: "Média fictif TechMada",
    org_type: "media",
    domains: [
      "technology_digital",
      "media_communication"
    ],
    languages: [
      "mg",
      "fr",
      "en"
    ],
    regions: [
      "analamanga"
    ],
    bio: "Profil fictif de démonstration. Usages numériques, désinformation en ligne et médias locaux.",
    contact_email: "toky.razafindrakoto@example.com",
    contact_phone: "+261 00 000 00 09",
    consent_status: "granted",
    last_verified_at: "2026-10-10",
    is_fictional: true
  },
  {
    id: "00000000-0000-4000-8000-000000000010",
    full_name: "Naina Rakotomalala Démo",
    title: "Géologue",
    organization: "Université fictive de Toliara",
    org_type: "academic",
    domains: [
      "mining_extractives",
      "environment_climate"
    ],
    languages: [
      "fr",
      "en"
    ],
    regions: [
      "atsimo_andrefana"
    ],
    bio: "Profil fictif de démonstration. Mines artisanales, ressources minérales et impacts environnementaux.",
    contact_email: "naina.rakotomalala@example.com",
    contact_phone: "+261 00 000 00 10",
    consent_status: "public_info",
    last_verified_at: "2026-01-20",
    is_fictional: true
  },
  {
    id: "00000000-0000-4000-8000-000000000011",
    full_name: "Fanja Andriamihaja Démo",
    title: "Analyste politiques",
    organization: "Institution fictive de veille citoyenne",
    org_type: "public_institution",
    domains: [
      "governance_politics",
      "statistics_demography",
      "security"
    ],
    languages: [
      "mg",
      "fr"
    ],
    regions: [
      "analamanga"
    ],
    bio: "Profil fictif de démonstration. Gouvernance locale, élections, sécurité publique et recensements.",
    contact_email: "fanja.andriamihaja@example.com",
    contact_phone: "+261 00 000 00 11",
    consent_status: "granted",
    last_verified_at: "2026-05-02",
    is_fictional: true
  },
  {
    id: "00000000-0000-4000-8000-000000000012",
    full_name: "Solo Ravelonarivo Démo",
    title: "Anthropologue",
    organization: "Association fictive Kultur'Aina",
    org_type: "association",
    domains: [
      "culture_society",
      "media_communication"
    ],
    languages: [
      "mg"
    ],
    regions: [
      "diana"
    ],
    bio: "Profil fictif de démonstration. Cultures locales, radio communautaire et transmission des savoirs.",
    contact_email: "solo.ravelonarivo@example.com",
    contact_phone: "+261 00 000 00 12",
    consent_status: "public_info",
    last_verified_at: "2026-08-22",
    is_fictional: true
  },
  {
    id: "00000000-0000-4000-8000-000000000013",
    full_name: "Hanta Rakotoarisoa Démo",
    title: "Avocate",
    organization: "ONG fictive Vontsona",
    org_type: "ngo",
    domains: [
      "human_rights_gender",
      "justice_law"
    ],
    languages: [
      "mg",
      "fr"
    ],
    regions: [
      "atsimo_atsinanana"
    ],
    bio: "Profil fictif de démonstration. Droits des femmes, violences basées sur le genre et aide juridique.",
    contact_email: "hanta.rakotoarisoa@example.com",
    contact_phone: "+261 00 000 00 13",
    consent_status: "granted",
    last_verified_at: "2026-07-30",
    is_fictional: true
  },
  {
    id: "00000000-0000-4000-8000-000000000014",
    full_name: "Jean-Marc Fabrice Démo",
    title: "Consultant en développement rural",
    organization: "Cabinet fictif FM Conseil",
    org_type: "private",
    domains: [
      "economy_finance",
      "agriculture_food"
    ],
    languages: [
      "fr",
      "en"
    ],
    regions: [
      "menabe"
    ],
    bio: "Profil fictif de démonstration. Filières agricoles, financement rural et coopératives. Consentement en attente.",
    contact_email: "jean-marc.fabrice@example.com",
    contact_phone: "+261 00 000 00 14",
    consent_status: "pending",
    last_verified_at: "2026-02-14",
    is_fictional: true
  },
  {
    id: "00000000-0000-4000-8000-000000000015",
    full_name: "Elia Andrianjafy Démo",
    title: "Médecin urgentiste",
    organization: "ONG fictive Salama",
    org_type: "ngo",
    domains: [
      "disaster_risk",
      "health"
    ],
    languages: [
      "mg",
      "fr"
    ],
    regions: [
      "vatovavy"
    ],
    bio: "Profil fictif de démonstration. Secours d'urgence, cyclones et santé communautaire. Consentement en attente.",
    contact_email: "elia.andrianjafy@example.com",
    contact_phone: "+261 00 000 00 15",
    consent_status: "pending",
    last_verified_at: "2026-09-01",
    is_fictional: true
  },
  {
    id: "00000000-0000-4000-8000-000000000016",
    full_name: "Mamy Rakotobe Démo",
    title: "Consultant médias",
    organization: "Réseau fictif des communicateurs",
    org_type: "independent",
    domains: [
      "media_communication",
      "technology_digital"
    ],
    languages: [
      "mg",
      "fr"
    ],
    regions: [],
    bio: "Profil fictif de démonstration. Médias, information locale et outils numériques. Consentement retiré.",
    contact_email: "mamy.rakotobe@example.com",
    contact_phone: "+261 00 000 00 16",
    consent_status: "revoked",
    last_verified_at: "2025-09-15",
    is_fictional: true
  }
];
