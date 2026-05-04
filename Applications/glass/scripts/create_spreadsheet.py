import openpyxl
from openpyxl.styles import Alignment, Font


def create_env_spreadsheet():
    """Creates a spreadsheet of environment variables."""

    # Data from our investigation
    env_vars_data = [
        ["Variable", "Purpose", "Default Value", "Used In"],
        [
            "GLASS_BRIDGE_PATH",
            "Specifies the path to the field-bridge.json state file.",
            "~/.caraxes/field-bridge.json",
            "Main App, Demo Scripts, Utility Scripts",
        ],
        [
            "GLASS_INVENTORY_PATH",
            "Specifies the path to the glass-inventory.json asset ledger.",
            "~/.caraxes/glass-inventory.json",
            "Main App, Verification Scripts",
        ],
        [
            "GLASS_DEVTOOLS",
            "If set to 1, automatically opens detached Chrome DevTools in development mode.",
            "(unset)",
            "Main App (npm run dev)",
        ],
        [
            "NODE_ENV",
            "Standard variable to distinguish between development and production modes.",
            "Set by electron-vite",
            "Main App",
        ],
    ]

    workbook = openpyxl.Workbook()
    sheet = workbook.active
    if sheet is None:
        raise RuntimeError("Workbook did not expose an active worksheet")
    sheet.title = "Glass Environment Variables"

    # Write data and apply styling
    for row_index, row_data in enumerate(env_vars_data, start=1):
        for col_index, cell_value in enumerate(row_data, start=1):
            cell = sheet.cell(row=row_index, column=col_index, value=cell_value)
            cell.alignment = Alignment(wrap_text=True, vertical="top")
            if row_index == 1:
                cell.font = Font(bold=True)

    # Adjust column widths
    sheet.column_dimensions["A"].width = 25
    sheet.column_dimensions["B"].width = 70
    sheet.column_dimensions["C"].width = 35
    sheet.column_dimensions["D"].width = 45

    output_filename = "glass_environment_variables.xlsx"
    workbook.save(output_filename)

    return output_filename


if __name__ == "__main__":
    filename = create_env_spreadsheet()
    print(f"Spreadsheet '{filename}' created successfully.")
