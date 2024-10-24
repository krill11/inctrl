import speech_recognition as sr
from pydub import AudioSegment
from pydub.silence import split_on_silence
import os
import sys

def transcribe_audio(path):
    """Splitting the large audio file into chunks
    and apply speech recognition on each of these chunks"""
    # create a speech recognition object
    r = sr.Recognizer()
    
    # open the audio file using pydub
    sound = AudioSegment.from_file(path)  
    # split audio sound where silence is 500 milliseconds or more and get chunks
    chunks = split_on_silence(sound,
        # experiment with this value for your target audio file
        min_silence_len = 500,
        # adjust this per requirement
        silence_thresh = sound.dBFS-14,
        # keep the silence for 1 second, adjustable as well
        keep_silence=500,
    )
    folder_name = "audio-chunks"
    # create a directory to store the audio chunks
    if not os.path.isdir(folder_name):
        os.mkdir(folder_name)
    whole_text = ""
    # process each chunk 
    for i, audio_chunk in enumerate(chunks, start=1):
        # export audio chunk and save it in
        # the `folder_name` directory.
        chunk_filename = os.path.join(folder_name, f"chunk{i}.wav")
        audio_chunk.export(chunk_filename, format="wav")
        # recognize the chunk
        with sr.AudioFile(chunk_filename) as source:
            audio_listened = r.record(source)
            # try converting it to text
            try:
                text = r.recognize_google(audio_listened)
            except sr.UnknownValueError as e:
                print("Error:", str(e), file=sys.stderr)
            else:
                text = f"{text.capitalize()}. "
                whole_text += text
    # remove the temporary directory
    for chunk_file in os.listdir(folder_name):
        os.remove(os.path.join(folder_name, chunk_file))
    os.rmdir(folder_name)
    # return the text for all chunks detected
    return whole_text.strip()

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python transcription_service.py <path_to_audio_file>", file=sys.stderr)
        sys.exit(1)
    
    audio_path = sys.argv[1]
    if not os.path.exists(audio_path):
        print(f"Error: File '{audio_path}' does not exist.", file=sys.stderr)
        sys.exit(1)
    
    try:
        transcription = transcribe_audio(audio_path)
        print(transcription)
    except Exception as e:
        print(f"Error during transcription: {str(e)}", file=sys.stderr)
        sys.exit(1)