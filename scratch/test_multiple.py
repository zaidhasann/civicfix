import os, sys
from pathlib import Path
sys.path.append(r'D:\civicfix\services\agent\src')
from civicfix_agent.resolver import resolve_location
from civicfix_agent.up_directory import UPWardDirectory
from civicfix_agent.vector_store import create_vector_store

# Initialize UP directory
csv_path = Path('D:/civicfix/services/agent/data/up_ward_directory.csv')
up_dir = UPWardDirectory(csv_path)
vector_store = create_vector_store()

addresses = [
    {
        'road': 'Nagar Nigam HQ, Lalbagh',
        'city': 'Lucknow',
        'district': 'Lucknow',
        'state': 'Uttar Pradesh',
    },
]

for addr in addresses:
    result = resolve_location(addr, 'pothole', vector_store, up_directory=up_dir)
    print('Address:', addr)
    print('Result email:', result.email)
    print('Full result:', result)
    print('---')
