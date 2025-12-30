"""
AI Services for Document Intelligence System
Provides LLM-based categorization, summarization, and topic extraction
"""

import os
import re
import json
import logging
from typing import Dict, Any, Optional, List, Tuple

import requests

logger = logging.getLogger(__name__)

# LLM Service configuration
LLM_HOST = os.getenv('LLM_SERVICE_HOST', 'llm-service')
LLM_PORT = int(os.getenv('LLM_SERVICE_PORT', '11434'))
LLM_MODEL = os.getenv('LLM_MODEL', 'qwen3:14b-q8')
LLM_TIMEOUT = int(os.getenv('LLM_AI_TIMEOUT', '120'))


class AIServices:
    """AI-powered document analysis services"""

    def __init__(self):
        self.llm_url = f"http://{LLM_HOST}:{LLM_PORT}"
        self.model = LLM_MODEL

    def _generate(
        self,
        prompt: str,
        max_tokens: int = 1024,
        temperature: float = 0.3,
        system_prompt: Optional[str] = None
    ) -> Optional[str]:
        """
        Generate text using the LLM service

        Args:
            prompt: User prompt
            max_tokens: Maximum tokens to generate
            temperature: Sampling temperature
            system_prompt: Optional system prompt

        Returns:
            Generated text or None on error
        """
        try:
            messages = []
            if system_prompt:
                messages.append({"role": "system", "content": system_prompt})
            messages.append({"role": "user", "content": prompt})

            response = requests.post(
                f"{self.llm_url}/api/chat",
                json={
                    "model": self.model,
                    "messages": messages,
                    "stream": False,
                    "options": {
                        "num_predict": max_tokens,
                        "temperature": temperature
                    }
                },
                timeout=LLM_TIMEOUT
            )
            response.raise_for_status()
            result = response.json()
            return result.get('message', {}).get('content', '')

        except requests.exceptions.Timeout:
            logger.error(f"LLM request timed out after {LLM_TIMEOUT}s")
            return None
        except Exception as e:
            logger.error(f"LLM generation error: {e}")
            return None

    def categorize_document(
        self,
        text_preview: str,
        filename: str,
        available_categories: List[Dict[str, Any]]
    ) -> Tuple[Optional[str], float]:
        """
        Categorize a document using LLM

        Args:
            text_preview: First ~2000 characters of document
            filename: Document filename
            available_categories: List of available categories with name and description

        Returns:
            Tuple of (category_name, confidence_score)
        """
        # Build category list for prompt
        category_list = "\n".join([
            f"- {cat['name']}: {cat.get('description', 'Keine Beschreibung')}"
            for cat in available_categories
        ])

        system_prompt = """Du bist ein Dokumenten-Klassifikator. Analysiere den Dokumentinhalt und die verfügbaren Kategorien.
Antworte NUR mit einem JSON-Objekt im Format:
{"category": "Kategoriename", "confidence": 0.85, "reason": "Kurze Begründung"}

Die Konfidenz ist ein Wert zwischen 0 und 1, wobei:
- 0.9-1.0: Sehr sicher
- 0.7-0.9: Wahrscheinlich
- 0.5-0.7: Möglich
- <0.5: Unsicher

Wähle "Allgemein" wenn keine andere Kategorie passt."""

        prompt = f"""Kategorisiere dieses Dokument:

Dateiname: {filename}

Inhalt (Vorschau):
{text_preview[:1500]}

Verfügbare Kategorien:
{category_list}

Antworte nur mit dem JSON-Objekt."""

        try:
            response = self._generate(
                prompt=prompt,
                max_tokens=256,
                temperature=0.2,
                system_prompt=system_prompt
            )

            if not response:
                return 'Allgemein', 0.5

            # Parse JSON from response
            json_match = re.search(r'\{[^}]+\}', response)
            if json_match:
                result = json.loads(json_match.group())
                category = result.get('category', 'Allgemein')
                confidence = float(result.get('confidence', 0.5))

                # Validate category exists
                valid_names = [c['name'] for c in available_categories]
                if category not in valid_names:
                    category = 'Allgemein'
                    confidence = 0.5

                return category, min(1.0, max(0.0, confidence))

        except json.JSONDecodeError:
            logger.warning("Failed to parse LLM categorization response")
        except Exception as e:
            logger.error(f"Categorization error: {e}")

        return 'Allgemein', 0.5

    def generate_summary(
        self,
        text: str,
        title: Optional[str] = None,
        max_words: int = 150
    ) -> Optional[str]:
        """
        Generate a summary of the document

        Args:
            text: Document text (will be truncated if too long)
            title: Optional document title for context
            max_words: Maximum words in summary

        Returns:
            Generated summary or None
        """
        # Truncate text to reasonable length for LLM
        max_chars = 4000
        truncated_text = text[:max_chars]
        if len(text) > max_chars:
            truncated_text += "..."

        system_prompt = f"""Du bist ein präziser Zusammenfasser. Erstelle eine klare, informative Zusammenfassung.
Die Zusammenfassung soll:
- Maximal {max_words} Wörter haben
- Die wichtigsten Punkte enthalten
- Sachlich und neutral sein
- In der gleichen Sprache wie das Dokument sein

Antworte NUR mit der Zusammenfassung, ohne Einleitung oder Kommentar."""

        title_context = f"Dokumenttitel: {title}\n\n" if title else ""

        prompt = f"""{title_context}Erstelle eine Zusammenfassung dieses Dokuments:

{truncated_text}

Zusammenfassung:"""

        try:
            summary = self._generate(
                prompt=prompt,
                max_tokens=512,
                temperature=0.3,
                system_prompt=system_prompt
            )

            if summary:
                # Clean up the summary
                summary = summary.strip()
                # Remove any meta-text the LLM might have added
                summary = re.sub(r'^(Zusammenfassung:|Summary:)\s*', '', summary, flags=re.IGNORECASE)
                return summary[:2000]  # Cap at 2000 chars

        except Exception as e:
            logger.error(f"Summary generation error: {e}")

        return None

    def extract_topics(
        self,
        text: str,
        max_topics: int = 10
    ) -> List[str]:
        """
        Extract key topics/keywords from document using LLM

        Args:
            text: Document text
            max_topics: Maximum number of topics to extract

        Returns:
            List of topic strings
        """
        # Truncate text
        truncated_text = text[:3000]

        system_prompt = f"""Du bist ein Keyword-Extraktor. Extrahiere die {max_topics} wichtigsten Themen/Schlüsselwörter aus dem Text.
Antworte NUR mit einer JSON-Liste von Strings, z.B.: ["Thema1", "Thema2", "Thema3"]
Verwende prägnante, aussagekräftige Begriffe (1-3 Wörter pro Thema)."""

        prompt = f"""Extrahiere die wichtigsten Themen aus diesem Text:

{truncated_text}

JSON-Liste der Themen:"""

        try:
            response = self._generate(
                prompt=prompt,
                max_tokens=256,
                temperature=0.2,
                system_prompt=system_prompt
            )

            if response:
                # Parse JSON array from response
                json_match = re.search(r'\[.*?\]', response, re.DOTALL)
                if json_match:
                    topics = json.loads(json_match.group())
                    if isinstance(topics, list):
                        return [str(t).strip() for t in topics[:max_topics] if t]

        except json.JSONDecodeError:
            logger.warning("Failed to parse LLM topic extraction response")
        except Exception as e:
            logger.error(f"Topic extraction error: {e}")

        return []

    def check_health(self) -> bool:
        """Check if LLM service is available"""
        try:
            response = requests.get(
                f"{self.llm_url}/api/tags",
                timeout=5
            )
            return response.status_code == 200
        except Exception:
            return False


class DocumentAnalyzer:
    """
    High-level document analysis combining all AI services
    """

    def __init__(self, ai_services: AIServices):
        self.ai = ai_services

    def analyze_document(
        self,
        text: str,
        filename: str,
        title: Optional[str] = None,
        categories: Optional[List[Dict[str, Any]]] = None
    ) -> Dict[str, Any]:
        """
        Perform full document analysis

        Args:
            text: Full document text
            filename: Document filename
            title: Optional extracted title
            categories: Available categories for classification

        Returns:
            Dictionary with analysis results
        """
        results = {
            'summary': None,
            'category': 'Allgemein',
            'category_confidence': 0.5,
            'key_topics': [],
            'analysis_complete': False
        }

        # Check if LLM is available
        if not self.ai.check_health():
            logger.warning("LLM service not available, skipping AI analysis")
            return results

        text_preview = text[:2000]

        # Generate summary
        logger.info(f"Generating summary for {filename}")
        results['summary'] = self.ai.generate_summary(text, title)

        # Categorize if categories provided
        if categories:
            logger.info(f"Categorizing {filename}")
            category, confidence = self.ai.categorize_document(
                text_preview, filename, categories
            )
            results['category'] = category
            results['category_confidence'] = confidence

        # Extract topics
        logger.info(f"Extracting topics for {filename}")
        results['key_topics'] = self.ai.extract_topics(text)

        results['analysis_complete'] = True
        return results
