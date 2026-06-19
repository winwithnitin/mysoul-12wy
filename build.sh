#!/bin/bash
# MySoul Dashboard — build script
# Run this from the repo root: ./build.sh

echo "Building dashboard..."
cd dashboard && npm run build && cd ..

# Copy root HTML files into docs/
echo "Copying root pages to docs/..."
cp index.html docs/ 2>/dev/null && echo "✓ index.html" || echo "⚠ index.html not found"
cp reiki-optin-page.html docs/ 2>/dev/null && echo "✓ reiki-optin-page.html" || true
cp reiki-optin-page-v2.html docs/ 2>/dev/null && echo "✓ reiki-optin-page-v2.html" || true

echo ""
echo "Done. Commit and push:"
echo "  git add docs/ && git commit -m 'Build update' && git push origin main"
