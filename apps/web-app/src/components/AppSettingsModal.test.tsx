import { render, screen, userEvent, waitFor } from "../test/render";
import { AppSettingsModal } from "./AppSettingsModal";

describe("AppSettingsModal", () => {
  const defaultProps = {
    onClose: vi.fn(),
  };

  const mockElectronAPI = {
    getPreferences: vi.fn(async () => ({
      basePort: 6969,
      setupPreference: "ask" as const,
      autoDownloadUpdates: true,
    })),
    updatePreferences: vi.fn(async () => {}),
  };

  beforeEach(() => {
    defaultProps.onClose.mockClear();
    mockElectronAPI.getPreferences.mockClear();
    mockElectronAPI.updatePreferences.mockClear();

    Object.defineProperty(window, "electronAPI", {
      value: mockElectronAPI,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "electronAPI", {
      value: undefined,
      writable: true,
      configurable: true,
    });
  });

  it("renders form fields after loading preferences", async () => {
    render(<AppSettingsModal {...defaultProps} />);

    expect(screen.getByRole("heading", { name: "App Settings" })).toBeInTheDocument();

    await waitFor(() => {
      expect(mockElectronAPI.getPreferences).toHaveBeenCalled();
    });

    expect(screen.getByText("Base Server Port")).toBeInTheDocument();
    expect(screen.getByText("New Project Setup")).toBeInTheDocument();
    expect(screen.getByText("Auto-download Updates")).toBeInTheDocument();
    expect(screen.getByRole("spinbutton")).toHaveValue(6969);
    expect(screen.getByRole("combobox")).toHaveValue("ask");
    expect(screen.getByRole("button", { name: "Auto-download updates" })).toBeInTheDocument();
  });

  it("disables Save when no changes have been made", async () => {
    render(<AppSettingsModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    });
  });

  it("enables Save after changing the base port", async () => {
    const user = userEvent.setup();

    render(<AppSettingsModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByRole("spinbutton")).toHaveValue(6969);
    });

    const portInput = screen.getByRole("spinbutton");
    await user.clear(portInput);
    await user.type(portInput, "7070");

    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("saves preferences and closes modal on successful save", async () => {
    const user = userEvent.setup();

    render(<AppSettingsModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByRole("spinbutton")).toHaveValue(6969);
    });

    const portInput = screen.getByRole("spinbutton");
    await user.tripleClick(portInput);
    await user.keyboard("8080");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(mockElectronAPI.updatePreferences).toHaveBeenCalledWith({
        basePort: 8080,
        setupPreference: "ask",
        autoDownloadUpdates: true,
      });
    });
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it("closes modal when Cancel is clicked", async () => {
    const user = userEvent.setup();

    render(<AppSettingsModal {...defaultProps} />);

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(defaultProps.onClose).toHaveBeenCalledOnce();
  });

  it("enables Save after toggling auto-download updates", async () => {
    const user = userEvent.setup();

    render(<AppSettingsModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByRole("spinbutton")).toHaveValue(6969);
    });

    await user.click(screen.getByRole("button", { name: "Auto-download updates" }));

    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("enables Save after changing setup preference", async () => {
    const user = userEvent.setup();

    render(<AppSettingsModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByRole("combobox")).toHaveValue("ask");
    });

    await user.selectOptions(screen.getByRole("combobox"), "auto");

    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });
});
