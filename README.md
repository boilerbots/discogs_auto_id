# Quick Explainer #

I want to use Discogs to catalog all my jukebox singles.

I put records in my jukebox and now I want to generate title strips for them
but I don't know what ended up in each slot. This application attempts to
listen to a short sound clip and identify the song and artitst. Then it
presents you with a list of 45 rpm singles that match the auto identification,
this list is queried from Discogs. You select which one best matches the record
in your machine and that is automatically added to a folder in your Discogs
account along with the slot number it was identified in.

Now that you have this information in Discogs you can use my other script to easily print title strips.

It also can be used by my Seeburg MCU upgrade module to show you a visual catalog of what is in your machine.

## Install dependencies

Clone the repository or download the project as a zip and extract it.
Make sure you have python3.12 or newer installed.

On Linux in the project directory.
```
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## How to use this

Work in progress.

## Build instructions

```
docker build . --tag us-central1-docker.pkg.dev/discogs-auto-id/cloud-run-source-deploy/discogsautoid:latest
```

Test it locally

```
docker run -p 8080:8080 us-central1-docker.pkg.dev/discogs-auto-id/cloud-run-source-deploy/discogsautoid:latest
```

Upload to gcloud

```
docker push  us-central1-docker.pkg.dev/discogs-auto-id/cloud-run-source-deploy/discogsautoid:latest
or
gcloud builds submit --tag us-central1-docker.pkg.dev/discogs-auto-id/cloud-run-source-deploy/discogsautoid:latest
```

Deploy new image

```
gcloud deploy discogsautoid  --image us-central1-docker.pkg.dev/discogs-auto-id/cloud-run-source-deploy/discogsautoid:latest
```
