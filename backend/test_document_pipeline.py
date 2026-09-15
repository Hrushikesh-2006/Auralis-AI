import os
import tempfile
import unittest
from unittest.mock import patch

from backend.services import pdf_podcast_service


class DocumentExtractionPipelineTests(unittest.TestCase):
    @patch("backend.services.pdf_podcast_service.requests.post")
    @patch.object(pdf_podcast_service.config, "GEMINI_API_KEY", "test-gemini-key")
    def test_image_file_uses_gemini_multimodal_fallback(self, mock_post):
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as handle:
            handle.write(b"not-a-real-image")
            temp_path = handle.name

        try:
            mock_post.return_value.status_code = 200
            mock_post.return_value.json.return_value = {
                "candidates": [{"content": {"parts": [{"text": "Key launch metrics\nRevenue: 10k"}]}}]
            }

            result = pdf_podcast_service.extract_document_text(temp_path, "chart.png")

            self.assertIn("Key launch metrics", result)
            self.assertTrue(mock_post.called)
        finally:
            os.remove(temp_path)


if __name__ == "__main__":
    unittest.main()
