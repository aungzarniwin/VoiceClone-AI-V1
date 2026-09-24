import sys
import os
import json

def create_clone(voice_file):

    if not os.path.exists(voice_file):
        raise FileNotFoundError(
            "Voice sample not found"
        )

    # Voice cloning model integration
    # will use the uploaded voice sample
    # as speaker reference.

    print(
        json.dumps({
            "status": "ready",
            "voice_sample": voice_file
        })
    )


def generate_speech(text):

    # TTS / voice-cloning model
    # will generate the audio here.

    print(
        json.dumps({
            "status": "ready",
            "text": text
        })
    )


if __name__ == "__main__":

    if len(sys.argv) < 2:
        sys.exit(1)

    if sys.argv[1] == "--speak":

        text = " ".join(sys.argv[2:])

        generate_speech(text)

    else:

        voice_file = sys.argv[1]

        create_clone(
            voice_file
        )
