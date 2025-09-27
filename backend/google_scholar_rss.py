#!/usr/bin/env python3
"""
Google Scholar to RSS Feed Service
Converts SerpAPI Google Scholar results into RSS format
"""

import os
import json
import requests
from datetime import datetime, timezone
from xml.etree.ElementTree import Element, SubElement, tostring
from xml.dom import minidom
from flask import Flask, request, Response, jsonify
from urllib.parse import quote, unquote
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

class ScholarRSSGenerator:
    def __init__(self, serpapi_key):
        self.serpapi_key = serpapi_key
        self.base_url = "https://serpapi.com/search"
    
    def search_scholar(self, query, num_results=20, year_low=None, year_high=None):
        """
        Search Google Scholar using SerpAPI
        """
        params = {
            'engine': 'google_scholar',
            'q': query,
            'api_key': self.serpapi_key,
            'num': num_results,
            'hl': 'en'
        }
        
        # Add year filters if provided
        if year_low:
            params['as_ylo'] = year_low
        if year_high:
            params['as_yhi'] = year_high
        
        try:
            response = requests.get(self.base_url, params=params)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            logger.error(f"SerpAPI request failed: {e}")
            return None
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse SerpAPI response: {e}")
            return None
    
    def create_rss_feed(self, search_results, query, base_url="http://localhost:5000"):
        """
        Convert Google Scholar results to RSS feed
        """
        # Create RSS root element
        rss = Element('rss')
        rss.set('version', '2.0')
        rss.set('xmlns:dc', 'http://purl.org/dc/elements/1.1/')
        rss.set('xmlns:atom', 'http://www.w3.org/2005/Atom')
        rss.set('xmlns:content', 'http://purl.org/rss/1.0/modules/content/')
        
        # Create channel
        channel = SubElement(rss, 'channel')
        
        # Channel metadata
        title = SubElement(channel, 'title')
        title.text = f"Google Scholar: {query}"
        
        link = SubElement(channel, 'link')
        link.text = f"{base_url}/scholar-rss"
        
        description = SubElement(channel, 'description')
        description.text = f"Latest Google Scholar results for: {query}"
        
        # Atom self-link
        atom_link = SubElement(channel, 'atom:link')
        atom_link.set('href', f"{base_url}/scholar-rss?q={quote(query)}")
        atom_link.set('rel', 'self')
        
        language = SubElement(channel, 'language')
        language.text = 'en'
        
        last_build_date = SubElement(channel, 'lastBuildDate')
        last_build_date.text = datetime.now(timezone.utc).strftime('%a, %d %b %Y %H:%M:%S %z')
        
        generator = SubElement(channel, 'generator')
        generator.text = 'Google Scholar RSS Service'
        
        # Add items from search results
        if search_results and 'organic_results' in search_results:
            for result in search_results['organic_results']:
                self._add_rss_item(channel, result)
        
        return self._prettify_xml(rss)
    
    def _add_rss_item(self, channel, result):
        """
        Add a single search result as RSS item
        """
        item = SubElement(channel, 'item')
        
        # Title
        title = SubElement(item, 'title')
        title.text = result.get('title', 'Untitled')
        
        # Link
        link = SubElement(item, 'link')
        link.text = result.get('link', '')
        
        # Description - combine snippet and citation info
        description_text = []
        
        if 'snippet' in result:
            description_text.append(result['snippet'])
        
        # Add publication info if available
        publication_info = result.get('publication_info', {})
        if 'summary' in publication_info:
            description_text.append(f"Published: {publication_info['summary']}")
        
        # Add cited by count
        if 'inline_links' in result:
            cited_by = result['inline_links'].get('cited_by')
            if cited_by and 'total' in cited_by:
                description_text.append(f"Cited by: {cited_by['total']}")
        
        description = SubElement(item, 'description')
        description.text = ' | '.join(description_text) if description_text else 'No description available'
        
        # GUID (unique identifier)
        guid = SubElement(item, 'guid')
        guid.text = result.get('result_id', result.get('link', ''))
        guid.set('isPermaLink', 'false' if 'result_id' in result else 'true')
        
        # Authors as DC creator
        if 'publication_info' in result and 'authors' in result['publication_info']:
            for author in result['publication_info']['authors']:
                creator = SubElement(item, 'dc:creator')
                creator.text = author.get('name', '')
        
        # Publication date (if available)
        if 'publication_info' in result and 'summary' in result['publication_info']:
            # Try to extract year from publication summary
            summary = result['publication_info']['summary']
            import re
            year_match = re.search(r'\b(19|20)\d{2}\b', summary)
            if year_match:
                pub_date = SubElement(item, 'pubDate')
                # Use January 1st of the year as default date
                try:
                    year = int(year_match.group())
                    date_obj = datetime(year, 1, 1, tzinfo=timezone.utc)
                    pub_date.text = date_obj.strftime('%a, %d %b %Y %H:%M:%S %z')
                except ValueError:
                    pass
        
        # Add source information
        if 'publication_info' in result and 'summary' in result['publication_info']:
            source = SubElement(item, 'dc:source')
            source.text = result['publication_info']['summary']
    
    def _prettify_xml(self, elem):
        """
        Return a pretty-printed XML string
        """
        rough_string = tostring(elem, 'utf-8')
        reparsed = minidom.parseString(rough_string)
        return reparsed.toprettyxml(indent="  ", encoding='utf-8')

# Initialize the RSS generator
rss_generator = None

def get_rss_generator():
    global rss_generator
    if rss_generator is None:
        serpapi_key = os.getenv('SERPAPI_KEY')
        if not serpapi_key:
            raise ValueError("SERPAPI_KEY environment variable is required")
        rss_generator = ScholarRSSGenerator(serpapi_key)
    return rss_generator

@app.route('/scholar-rss')
def scholar_rss():
    """
    Main endpoint to generate RSS feed from Google Scholar search
    """
    try:
        # Get query parameter
        query = request.args.get('q', '')
        if not query:
            return jsonify({'error': 'Query parameter "q" is required'}), 400
        
        # Get optional parameters
        num_results = int(request.args.get('num', 20))
        year_low = request.args.get('year_low')
        year_high = request.args.get('year_high')
        
        # Get base URL for self-referencing
        base_url = request.url_root.rstrip('/')
        
        # Generate RSS feed
        generator = get_rss_generator()
        search_results = generator.search_scholar(
            query=query, 
            num_results=num_results,
            year_low=year_low,
            year_high=year_high
        )
        
        if search_results is None:
            return jsonify({'error': 'Failed to fetch search results'}), 500
        
        rss_content = generator.create_rss_feed(search_results, query, base_url)
        
        return Response(
            rss_content, 
            mimetype='application/rss+xml',
            headers={'Content-Type': 'application/rss+xml; charset=utf-8'}
        )
    
    except Exception as e:
        logger.error(f"Error generating RSS feed: {e}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/health')
def health_check():
    """
    Health check endpoint
    """
    return jsonify({'status': 'healthy', 'service': 'Google Scholar RSS'})

@app.route('/')
def index():
    """
    Service information endpoint
    """
    return jsonify({
        'service': 'Google Scholar to RSS Feed',
        'endpoints': {
            '/scholar-rss': 'Generate RSS feed (requires "q" parameter)',
            '/health': 'Health check'
        },
        'parameters': {
            'q': 'Search query (required)',
            'num': 'Number of results (default: 20)',
            'year_low': 'Earliest publication year (optional)',
            'year_high': 'Latest publication year (optional)'
        },
        'example': '/scholar-rss?q=machine%20learning&num=10&year_low=2020'
    })

if __name__ == '__main__':
    # Check for required environment variable
    if not os.getenv('SERPAPI_KEY'):
        print("Error: SERPAPI_KEY environment variable is required")
        print("Get your API key from: https://serpapi.com/")
        exit(1)
    
    # Run the Flask app
    app.run(host='0.0.0.0', port=5000, debug=True)