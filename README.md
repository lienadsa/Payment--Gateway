Mock Payment Gateway

A backend payment gateway built with Node.js and PostgreSQL that simulates payment processing through a mock bank API. The project implements core payment operations, including authorization, capture, voids, and refunds, with a focus on reliable transaction processing.

Key Features

Payment lifecycle and state management

Idempotency to prevent duplicate transaction processing

Retry handling for failed bank API requests

Transaction status tracking and audit history

PostgreSQL-backed persistence and recovery

Tech Stack

Node.js

Express.js

PostgreSQL

Axios

Docker

Purpose: Built to explore real-world payment infrastructure concepts, including transaction reliability, failure recovery, API integration, and idempotent request handling.
