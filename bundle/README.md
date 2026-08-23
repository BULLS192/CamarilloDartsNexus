# Deployment source bundle

This folder contains a base64-encoded `tar.gz` snapshot of the complete Camarillo Darts V0.7.1 source used by the Docker build. It intentionally excludes the live `data/db.json` player/contact database and the companion `.xlsx` workbook.

The Dockerfile reconstructs the archive in this order:

```text
camarillo.part00
camarillo.part00b
camarillo.part01
camarillo.part02
camarillo.part04
```

These names reflect the order the chunks were uploaded through the GitHub connector. Do not reorder or rename them unless you also update the Dockerfile.

The normal source tree is the preferred place for future development; this bundle is the deployment-safe canonical snapshot for V0.7.1.
