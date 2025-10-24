Blockchain Relational Database for Sensitive Data

A private blockchain system layered over PostgreSQL for secure sensitive data handling, featuring end-to-end RSA/AES encryption managed via a web interface.

Key Features

    Hybrid Encryption: End-to-end security using RSA-OAEP 2048-bit for key management and AES-256-GCM for data encryption.

    Immutable Blockchain: PostgreSQL-based chain with Proof-of-Work (SHA-256), digital signatures, and hash linking ensures integrity and non-repudiation.

    Secure Key Management: RSA private keys never leave the client's browser, maximizing privacy.

    Containerized Architecture: The entire application stack is orchestrated using Docker Compose for simple, replicable, and isolated setup.

    Intuitive Dashboard: A React-based user interface for registering users (creators), creating blocks, exploring the chain, and securely decrypting data.

    Unified Access: Nginx acts as a reverse proxy for routing, basic security, and load balancing.

Prerequisites

Before starting, ensure you have the following tools installed on your system:

    Git

    Docker

    Docker Compose (usually included with Docker Desktop)

Installation and Startup Guide

    Clone the Repository:
```bash
git clone <YOUR_REPOSITORY_URL>
cd <PROJECT_DIRECTORY_NAME>
```

Configure Environment Variables:

    This project requires a .env file for configuration. Copy the provided example file:

```bash
cp .env.example .env
```
    The default values in this file are ready for local development.

Prepare Dependencies (First-Time Only):

    Before the first build, you must generate the package-lock.json files. Run these commands from the project root:

```bash
(cd backend && npm install)
(cd frontend && npm install)
```

Build and Start the System:

    This command handles downloading/building images and starting all containers.

```bash
docker-compose up --build -d
```
    --build: Forces an image rebuild (use if you change code).

    -d: Runs services in the background (detached mode).

Verify Services:

    Check the container status. Wait for all postgres services to show (healthy) and node services to show Up.

```bash
    docker-compose ps
```
    (Optional) View real-time logs (very useful for debugging):
```bash
    docker-compose logs -f
```

    # Or view logs for a specific service:
    # docker-compose logs -f node1

    Access the Application:

        Once all services are running:

        Frontend (Web Application): Open your browser to http://localhost:80 (served by Nginx).

        Backend API (via Nginx Proxy): Available at http://localhost:80/api.

    You can now start using the application to register creators, create blocks, and more.

Managing the Docker Environment

    Start services in background: docker-compose up -d

    Stop all services: docker-compose down

    Stop services and remove volumes (WARNING: This permanently deletes all database data): docker-compose down -v

    Restart all services: docker-compose restart

    Restart specific service(s): docker-compose restart <service_name> (e.g., docker-compose restart node1 nginx)

    Check container status: docker-compose ps

    View logs: docker-compose logs -f [service_name] (e.g., node1, nginx)

    Execute a command inside a container: docker-compose exec <service_name> <command> (e.g., docker-compose exec postgres1 psql -U blockchain_user -d blockchain_db)

Technology Stack

    Backend: Node.js, Express, PostgreSQL (pg driver), WebSocket (ws)

    Frontend: React, Vite, Tailwind CSS, react-query

    Blockchain Core: SHA-256 (Proof-of-Work), RSA-OAEP / AES-GCM (Encryption), Digital Signatures

    Infrastructure: Docker, Docker Compose, Nginx

    Database: PostgreSQL 16