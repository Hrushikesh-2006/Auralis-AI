import re

def strip_special_characters(text: str) -> str:
    r"""
    Strips special characters, markdown symbols (*, #, _, `, ~, [], {}, <>, \, /, |, @, $, %, ^, &, +, =, etc.),
    and emojis from text, returning clean plain English sentences.
    """
    if not text:
        return ""
    # Strip HTML tags if any
    cleaned = re.sub(r'<[^>]+>', '', text)
    # Replace special characters and markdown formatting with spaces
    cleaned = re.sub(r'[\*\#\_\`\~\{\}\[\]\<\>\\\/\|\@\$\%\^\&\+\=\:\;\•\–\—]', ' ', cleaned)
    # Keep only standard alphanumeric, spaces, and standard sentence punctuation (. , ? ! - ')
    cleaned = re.sub(r'[^\w\s\.\,\?\!\-\']', '', cleaned)
    # Collapse multiple whitespace
    cleaned = re.sub(r'\s+', ' ', cleaned)
    return cleaned.strip()
