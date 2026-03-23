"""Run the pinned upstream FastMCP server without invoking uv or the mcp CLI."""

from id_mcp import mcp


if __name__ == "__main__":
    mcp.run(transport="stdio")
