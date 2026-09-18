#!/usr/bin/env python3
"""Perform a read-only JATOS API connectivity and authorization check."""

from _jatos_api import JatosClient, unwrap_data


def main() -> None:
    client = JatosClient()
    endpoint = "/jatos/api/v1/studies/properties?withComponentProperties=true"
    studies = unwrap_data(client.get_json(endpoint))
    count = len(studies) if isinstance(studies, list) else 1
    print(f"JATOS API reachable: {client.base_url}")
    print(f"Endpoint: {endpoint}")
    print(f"Accessible studies: {count}")


if __name__ == "__main__":
    main()
