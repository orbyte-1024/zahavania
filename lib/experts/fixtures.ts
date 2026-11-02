import type { ExpertRow } from "@/lib/db/experts";

export const FIXTURE_EXPERTS: readonly ExpertRow[] = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    full_name: "RAJAONARISON Andy Williano",
    title: "Médecin de santé publique",
    organization: "Centre de santé publique Mahasoa",
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
    bio: "Santé publique, vaccination et données sanitaires à Madagascar.",
    contact_email: "andy.rajaonarison@example.com",
    contact_phone: "+261 00 000 00 01",
    consent_status: "granted",
    last_verified_at: "2026-08-15",
    is_fictional: true
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    full_name: "RAHARINIAINA Hajatiana Sandinah",
    title: "Enseignante-chercheuse en épidémiologie",
    organization: "Institut d'épidémiologie Fanantenana",
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
    bio: "Épidémiologie, formation des soignants et santé communautaire.",
    contact_email: "hajatiana.rahariniaina@example.com",
    contact_phone: "+261 00 000 00 02",
    consent_status: "granted",
    last_verified_at: "2026-10-01",
    is_fictional: true
  },
  {
    id: "00000000-0000-4000-8000-000000000003",
    full_name: "Andry Ravelo",
    title: "Avocat",
    organization: "Cabinet Ravelo & Associés",
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
    bio: "Droit pénal, accès à la justice et droits des personnes vulnérables.",
    contact_email: "andry.ravelo@example.com",
    contact_phone: "+261 00 000 00 03",
    consent_status: "public_info",
    last_verified_at: "2026-09-20",
    is_fictional: true
  },
  {
    id: "00000000-0000-4000-8000-000000000004",
    full_name: "Lalao Andrianina",
    title: "Économiste",
    organization: "Observatoire des politiques publiques Tsinjo",
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
    bio: "Budget public, fiscalité et politiques économiques nationales.",
    contact_email: "lalao.andrianina@example.com",
    contact_phone: "+261 00 000 00 04",
    consent_status: "granted",
    last_verified_at: "2026-10-20",
    is_fictional: true
  },
  {
    id: "00000000-0000-4000-8000-000000000005",
    full_name: "Tiana Rabe",
    title: "Agronome",
    organization: "ONG Tantely",
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
    bio: "Cultures vivrières, semences et adaptation des exploitations familiales.",
    contact_email: "tiana.rabe@example.com",
    contact_phone: "+261 00 000 00 05",
    consent_status: "public_info",
    last_verified_at: "2026-07-12",
    is_fictional: true
  },
  {
    id: "00000000-0000-4000-8000-000000000006",
    full_name: "Miora Rakotondrabe",
    title: "Chercheuse en environnement",
    organization: "Institut Ranomasina de recherche sur le littoral",
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
    bio: "Érosion côtière, mangroves et risques climatiques dans l'est.",
    contact_email: "miora.rakotondrabe@example.com",
    contact_phone: "+261 00 000 00 06",
    consent_status: "granted",
    last_verified_at: "2026-06-18",
    is_fictional: true
  },
  {
    id: "00000000-0000-4000-8000-000000000007",
    full_name: "Faly Randria",
    title: "Ingénieur transports",
    organization: "Transport+ Conseil",
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
    bio: "Routes rurales, transport urbain et électrification des communes.",
    contact_email: "faly.randria@example.com",
    contact_phone: "+261 00 000 00 07",
    consent_status: "granted",
    last_verified_at: "2025-12-01",
    is_fictional: true
  },
  {
    id: "00000000-0000-4000-8000-000000000008",
    full_name: "Voahangy Ramiandrisoa",
    title: "Présidente d'association",
    organization: "Association Fanabeazana",
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
    bio: "Éducation de base, alphabétisation et médiation culturelle.",
    contact_email: "voahangy.ramiandrisoa@example.com",
    contact_phone: "+261 00 000 00 08",
    consent_status: "public_info",
    last_verified_at: "2026-09-05",
    is_fictional: true
  },
  {
    id: "00000000-0000-4000-8000-000000000009",
    full_name: "Toky Razafindrakoto",
    title: "Journaliste spécialisé",
    organization: "Haino Vaovao Numérique",
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
    bio: "Usages numériques, désinformation en ligne et médias locaux.",
    contact_email: "toky.razafindrakoto@example.com",
    contact_phone: "+261 00 000 00 09",
    consent_status: "granted",
    last_verified_at: "2026-10-10",
    is_fictional: true
  },
  {
    id: "00000000-0000-4000-8000-000000000010",
    full_name: "Naina Rakotomalala",
    title: "Géologue",
    organization: "Centre d'études minières du Sud",
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
    bio: "Mines artisanales, ressources minérales et impacts environnementaux.",
    contact_email: "naina.rakotomalala@example.com",
    contact_phone: "+261 00 000 00 10",
    consent_status: "public_info",
    last_verified_at: "2026-01-20",
    is_fictional: true
  },
  {
    id: "00000000-0000-4000-8000-000000000011",
    full_name: "Fanja Andriamihaja",
    title: "Analyste politiques",
    organization: "Collectif de veille citoyenne Mahery",
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
    bio: "Gouvernance locale, élections, sécurité publique et recensements.",
    contact_email: "fanja.andriamihaja@example.com",
    contact_phone: "+261 00 000 00 11",
    consent_status: "granted",
    last_verified_at: "2026-05-02",
    is_fictional: true
  },
  {
    id: "00000000-0000-4000-8000-000000000012",
    full_name: "Solo Ravelonarivo",
    title: "Anthropologue",
    organization: "Association Kultur'Aina",
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
    bio: "Cultures locales, radio communautaire et transmission des savoirs.",
    contact_email: "solo.ravelonarivo@example.com",
    contact_phone: "+261 00 000 00 12",
    consent_status: "public_info",
    last_verified_at: "2026-08-22",
    is_fictional: true
  },
  {
    id: "00000000-0000-4000-8000-000000000013",
    full_name: "Hanta Rakotoarisoa",
    title: "Avocate",
    organization: "ONG Vontsona",
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
    bio: "Droits des femmes, violences basées sur le genre et aide juridique.",
    contact_email: "hanta.rakotoarisoa@example.com",
    contact_phone: "+261 00 000 00 13",
    consent_status: "granted",
    last_verified_at: "2026-07-30",
    is_fictional: true
  },
  {
    id: "00000000-0000-4000-8000-000000000014",
    full_name: "Jean-Marc Fabrice",
    title: "Consultant en développement rural",
    organization: "FM Conseil",
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
    bio: "Filières agricoles, financement rural et coopératives. Consentement en attente.",
    contact_email: "jean-marc.fabrice@example.com",
    contact_phone: "+261 00 000 00 14",
    consent_status: "pending",
    last_verified_at: "2026-02-14",
    is_fictional: true
  },
  {
    id: "00000000-0000-4000-8000-000000000015",
    full_name: "Elia Andrianjafy",
    title: "Médecin urgentiste",
    organization: "ONG Salama",
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
    bio: "Secours d'urgence, cyclones et santé communautaire. Consentement en attente.",
    contact_email: "elia.andrianjafy@example.com",
    contact_phone: "+261 00 000 00 15",
    consent_status: "pending",
    last_verified_at: "2026-09-01",
    is_fictional: true
  },
  {
    id: "00000000-0000-4000-8000-000000000016",
    full_name: "Mamy Rakotobe",
    title: "Consultant médias",
    organization: "Réseau des communicateurs Feo",
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
    bio: "Médias, information locale et outils numériques. Consentement retiré.",
    contact_email: "mamy.rakotobe@example.com",
    contact_phone: "+261 00 000 00 16",
    consent_status: "revoked",
    last_verified_at: "2025-09-15",
    is_fictional: true
  }
];
