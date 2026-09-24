import os
import sys
import json
import uuid
import argparse

import torch

from openvoice import se_extractor
from openvoice.api import ToneColorConverter

try:
    from melo.api import TTS
except ImportError:
    TTS = None


BASE_DIR = os.path.dirname(
    os.path.abspath(__file__)
)

CHECKPOINT_DIR = os.path.join(
    BASE_DIR,
    "checkpoints_v2"
)

CONVERTER_DIR = os.path.join(
    CHECKPOINT_DIR,
    "converter"
)

OUTPUT_DIR = os.path.join(
    BASE_DIR,
    "outputs"
)

PROCESSED_DIR = os.path.join(
    BASE_DIR,
    "processed"
)

os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(PROCESSED_DIR, exist_ok=True)


DEVICE = (
    "cuda"
    if torch.cuda.is_available()
    else "cpu"
)


converter_config = os.path.join(
    CONVERTER_DIR,
    "config.json"
)

converter_checkpoint = os.path.join(
    CONVERTER_DIR,
    "checkpoint.pth"
)


converter = None


def load_converter():

    global converter

    if converter is None:

        if not os.path.exists(
            converter_config
        ):
            raise FileNotFoundError(
                f"Missing: {converter_config}"
            )

        if not os.path.exists(
            converter_checkpoint
        ):
            raise FileNotFoundError(
                f"Missing: {converter_checkpoint}"
            )

        print(
            "Loading OpenVoice converter...",
            file=sys.stderr
        )

        converter = ToneColorConverter(
            converter_config,
            device=DEVICE
        )

        converter.load_ckpt(
            converter_checkpoint
        )

    return converter


def create_voice_profile(
    reference_audio
):

    """
    Extract the target speaker embedding
    from the user's reference voice.
    """

    converter_model = load_converter()

    if not os.path.exists(
        reference_audio
    ):
        raise FileNotFoundError(
            "Reference audio not found."
        )

    target_se, audio_name = (
        se_extractor.get_se(
            reference_audio,
            converter_model,
            target_dir=PROCESSED_DIR,
            vad=True
        )
    )

    profile_id = str(
        uuid.uuid4()
    )

    profile_path = os.path.join(
        PROCESSED_DIR,
        profile_id + ".pth"
    )

    torch.save(
        target_se.cpu(),
        profile_path
    )

    return {
        "profile_id": profile_id,
        "profile_path": profile_path
    }


def clone_audio(
    source_audio,
    reference_audio,
    output_audio
):

    """
    Convert source speech into
    the reference speaker's voice.
    """

    converter_model = load_converter()

    if not os.path.exists(
        source_audio
    ):
        raise FileNotFoundError(
            "Source audio not found."
        )

    if not os.path.exists(
        reference_audio
    ):
        raise FileNotFoundError(
            "Reference audio not found."
        )

    source_se, _ = (
        se_extractor.get_se(
            source_audio,
            converter_model,
            target_dir=PROCESSED_DIR,
            vad=True
        )
    )

    target_se, _ = (
        se_extractor.get_se(
            reference_audio,
            converter_model,
            target_dir=PROCESSED_DIR,
            vad=True
        )
    )

    converter_model.convert(
        audio_src_path=source_audio,
        src_se=source_se,
        tgt_se=target_se,
        output_path=output_audio,
        message="@VoiceCloneAI"
    )

    return output_audio


def generate_tts(
    text,
    language,
    reference_audio,
    output_audio
):

    """
    OpenVoice V2 + MeloTTS pipeline.

    MeloTTS creates the base speech.
    OpenVoice converts the tone color.
    """

    if TTS is None:
        raise RuntimeError(
            "MeloTTS is not installed."
        )

    converter_model = load_converter()

    if not os.path.exists(
        reference_audio
    ):
        raise FileNotFoundError(
            "Reference voice not found."
        )

    language = language.lower()

    supported_languages = {
        "en",
        "es",
        "fr",
        "zh",
        "ja",
        "ko"
    }

    if language not in supported_languages:

        raise ValueError(
            "OpenVoice V2/MeloTTS native "
            "language is not available for "
            f"'{language}'. "
            "Use en/es/fr/zh/ja/ko."
        )

    print(
        "Loading MeloTTS...",
        file=sys.stderr
    )

    tts = TTS(
        language=language,
        device=DEVICE
    )

    speaker_ids = (
        tts.hps.data.spk2id
    )

    if not speaker_ids:
        raise RuntimeError(
            "No MeloTTS speakers found."
        )

    speaker_id = list(
        speaker_ids.values()
    )[0]

    temp_audio = os.path.join(
        OUTPUT_DIR,
        "base_" + str(uuid.uuid4()) + ".wav"
    )

    tts.tts_to_file(
        text,
        speaker_id,
        temp_audio,
        speed=1.0
    )

    source_se, _ = (
        se_extractor.get_se(
            temp_audio,
            converter_model,
            target_dir=PROCESSED_DIR,
            vad=True
        )
    )

    target_se, _ = (
        se_extractor.get_se(
            reference_audio,
            converter_model,
            target_dir=PROCESSED_DIR,
            vad=True
        )
    )

    converter_model.convert(
        audio_src_path=temp_audio,
        src_se=source_se,
        tgt_se=target_se,
        output_path=output_audio,
        message="@VoiceCloneAI"
    )

    if os.path.exists(temp_audio):
        os.remove(temp_audio)

    return output_audio


def main():

    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--profile",
        type=str
    )

    parser.add_argument(
        "--clone",
        nargs=2,
        metavar=("SOURCE", "REFERENCE")
    )

    parser.add_argument(
        "--tts",
        type=str
    )

    parser.add_argument(
        "--language",
        type=str,
        default="en"
    )

    parser.add_argument(
        "--reference",
        type=str
    )

    parser.add_argument(
        "--output",
        type=str
    )

    args = parser.parse_args()

    try:

        if args.profile:

            result = create_voice_profile(
                args.profile
            )

            print(
                json.dumps({
                    "success": True,
                    **result
                })
            )

            return


        if args.clone:

            source_audio = args.clone[0]
            reference_audio = args.clone[1]

            output_audio = (
                args.output
                or os.path.join(
                    OUTPUT_DIR,
                    "clone.wav"
                )
            )

            result = clone_audio(
                source_audio,
                reference_audio,
                output_audio
            )

            print(
                json.dumps({
                    "success": True,
                    "audio": result
                })
            )

            return


        if args.tts:

            if not args.reference:
                raise ValueError(
                    "--reference is required"
                )

            output_audio = (
                args.output
                or os.path.join(
                    OUTPUT_DIR,
                    "voice.wav"
                )
            )

            result = generate_tts(
                args.tts,
                args.language,
                args.reference,
                output_audio
            )

            print(
                json.dumps({
                    "success": True,
                    "audio": result
                })
            )

            return


        raise ValueError(
            "No operation specified."
        )

    except Exception as e:

        print(
            json.dumps({
                "success": False,
                "error": str(e)
            })
        )

        sys.exit(1)


if __name__ == "__main__":
    main()
