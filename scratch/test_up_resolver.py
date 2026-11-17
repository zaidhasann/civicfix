import os, sys
from pathlib import Path
sys.path.append(r'D:\civicfix\services\agent\src')
from civicfix_agent.resolver import resolve_location
from civicfix_agent.up_directory import UPWardDirectory
from civicfix_agent.vector_store import create_vector_store


# Mock address for Bidhuna, Agra-Lucknow Expressway
address = {
    'road': 'Agra-Lucknow Expressway',
    'city': 'Bidhuna',
    'state': 'Uttar Pradesh',
    'district': 'Auraiya'
}
# Initialize directory (path from settings, assume env variable or hardcode placeholder)
csv_path = Path('D:/civicfix/services/agent/data/up_ward_directory.csv')
if not csv_path.exists():
    print('CSV not found')
    sys.exit(0)
up_dir = UPWardDirectory(csv_path)
# Use a dummy vector store (Chroma) - may be heavy; we'll just use empty store for fallback path
vector_store = create_vector_store()
result = resolve_location(address, 'pothole', vector_store, up_directory=up_dir)
print('Result:', result)
