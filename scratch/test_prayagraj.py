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
    'road': 'Sarojini Naidu Marg, Civil Lines',
    'city': 'Prayagraj',
    'district': 'Prayagraj',
    'state': 'Uttar Pradesh',
    'postcode': '211001',
    'house_number': '1',
}
result = resolve_location(address, 'pothole', vector_store, up_directory=up_dir)
print('Result email:', result.email)
print('Full result:', result)
