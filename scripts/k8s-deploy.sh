#!/bin/bash
set -e

# Get the directory of the script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$SCRIPT_DIR/.."

# Parse arguments
ENVIRONMENT=${1:-onprem}
NAMESPACE=${2:-virtual-browser}
VERSION=${3:-latest}

# Validate environment
if [[ ! "$ENVIRONMENT" =~ ^(gcp|onprem)$ ]]; then
    echo "Error: Environment must be 'gcp' or 'onprem'"
    exit 1
fi

# Create namespace if it doesn't exist
kubectl create namespace $NAMESPACE --dry-run=client -o yaml | kubectl apply -f -

# Build and tag image
if [ "$ENVIRONMENT" == "gcp" ]; then
    # Build for GCP
    gcloud builds submit --tag gcr.io/$PROJECT_ID/virtual-browser:$VERSION
else
    # Build locally
    docker build -t virtual-browser:$VERSION .
    # Tag for local registry if needed
    # docker tag virtual-browser:$VERSION your-registry.com/virtual-browser:$VERSION
fi

# Apply Kubernetes configurations
kubectl apply -k deploy/kubernetes/overlays/$ENVIRONMENT

# Wait for rollout
kubectl -n $NAMESPACE rollout status deployment/virtual-browser 