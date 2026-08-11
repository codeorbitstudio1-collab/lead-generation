"""
Shared constants for LeadGen Command Center.

Centralises BUSINESS_CATEGORIES, MOCK_RESULTS, and call prompt maps
so they are defined exactly once and imported from one place.
"""
from typing import Dict, List, Any

# ─── Business Categories ──────────────────────────────────────────────────────

BUSINESS_CATEGORIES: List[str] = [
    # Local services (existing)
    "restaurant", "cafe", "bar", "bakery", "spa", "beauty_salon",
    "hair_care", "gym", "lodging", "hotel", "car_rental", "car_repair",
    "moving_company", "plumber", "electrician", "dentist", "doctor",
    "lawyer", "real_estate_agency", "clothing_store", "shoe_store",
    "jewelry_store", "florist", "pet_store", "pharmacy", "supermarket",
    "school", "tourist_attraction", "travel_agency",
    # Digital / tech niches (new)
    "web_design", "web_development", "digital_marketing", "seo_agency",
    "social_media_marketing", "software_development", "it_services",
    "ecommerce", "app_development", "graphic_design", "content_marketing",
    "video_production", "photography_studio", "startup", "coworking_space",
    "online_store", "cloud_services", "data_analytics", "devops_consulting",
    "freelance_platform", "consulting_firm", "training_institute",
]

# ─── Mock Data (used when Google Maps API key is not configured) ──────────────

MOCK_RESULTS: List[Dict[str, Any]] = [
    {
        "place_id": "mock_1",
        "name": "Ravi's Punjabi Dhaba",
        "address": "Sector 22, Chandigarh",
        "phone": "+91-9876543210",
        "website": None,
        "rating": 4.5,
        "user_ratings_total": 245,
        "types": ["restaurant"],
    },
    {
        "place_id": "mock_2",
        "name": "Bliss Spa & Salon",
        "address": "MG Road, Bangalore",
        "phone": "+91-9988776655",
        "website": None,
        "rating": 4.7,
        "user_ratings_total": 189,
        "types": ["spa", "beauty_salon"],
    },
    {
        "place_id": "mock_3",
        "name": "Grand Meridian Hotel",
        "address": "Marine Drive, Mumbai",
        "phone": "+91-2244556677",
        "website": "https://grandmeridian.com",
        "rating": 4.3,
        "user_ratings_total": 890,
        "types": ["hotel", "lodging"],
    },
    {
        "place_id": "mock_4",
        "name": "Quick Movers Transport",
        "address": "GT Road, Delhi",
        "phone": "+91-9871122334",
        "website": None,
        "rating": 4.1,
        "user_ratings_total": 67,
        "types": ["moving_company"],
    },
    {
        "place_id": "mock_5",
        "name": "Golden Crust Bakery",
        "address": "Park Street, Kolkata",
        "phone": "+91-9832145678",
        "website": None,
        "rating": 4.6,
        "user_ratings_total": 312,
        "types": ["bakery"],
    },
    {
        "place_id": "mock_6",
        "name": "Elite Fitness Club",
        "address": "Anna Nagar, Chennai",
        "phone": None,
        "website": "https://elitefit.in",
        "rating": 4.4,
        "user_ratings_total": 156,
        "types": ["gym"],
    },
    {
        "place_id": "mock_7",
        "name": "Serene Ayurveda Spa",
        "address": "Kovalam Beach Road, Kerala",
        "phone": "+91-9447788990",
        "website": None,
        "rating": 4.8,
        "user_ratings_total": 421,
        "types": ["spa"],
    },
    {
        "place_id": "mock_8",
        "name": "Cafe Aroma",
        "address": "Koregaon Park, Pune",
        "phone": "+91-9922334455",
        "website": None,
        "rating": 4.2,
        "user_ratings_total": 178,
        "types": ["cafe"],
    },
]

# ─── Allowed URL schemes for external fetches (SSRF guard) ───────────────────

ALLOWED_URL_SCHEMES = {"http", "https"}

# ─── Private / reserved IP prefixes to block (SSRF guard) ────────────────────

PRIVATE_IP_PREFIXES = (
    "127.",       # loopback
    "10.",        # RFC-1918
    "192.168.",   # RFC-1918
    "172.16.",    # RFC-1918 (172.16–31)
    "172.17.",
    "172.18.",
    "172.19.",
    "172.20.",
    "172.21.",
    "172.22.",
    "172.23.",
    "172.24.",
    "172.25.",
    "172.26.",
    "172.27.",
    "172.28.",
    "172.29.",
    "172.30.",
    "172.31.",
    "169.254.",   # link-local
    "::1",        # IPv6 loopback
    "fc",         # IPv6 unique-local
    "fd",         # IPv6 unique-local
    "fe80",       # IPv6 link-local
    "0.",         # 0.0.0.0
    "localhost",  # hostname guard
    "metadata.",  # cloud metadata (e.g. 169.254.169.254)
)

