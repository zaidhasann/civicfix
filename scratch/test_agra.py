import os, sys
from pathlib import Path
sys.path.append(r'D:\civicfix\services\agent\src')
from civicfix_agent.resolver import resolve_location
from civicfix_agent.up_directory import UPWardDirectory
from civicfix_agent.vector_store import create_vector_store

csv_path = Path('D:/civicfix/services/agent/data/up_ward_directory.csv')
up_dir = UPWardDirectory(csv_path)
vector_store = create_vector_store()

address = {
    'road': 'M.G. Road, Sanjay Place',
    'city': 'Agra',
    'district': 'Agra',
    'state': 'Uttar Pradesh',
    'postcode': '282002',
    'neighbourhood': 'Soorsadan',
}
result = resolve_location(address, 'pothole', vector_store, up_directory=up_dir)
print('Result email:', result.email)
print('Full result:', result)
